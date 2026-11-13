// Runs synchronously in <head>, before any client module can read preferences.
// Each key is independent: blocked/quota-limited writes preserve the old value.
export const BRAND_STORAGE_MIGRATION_SCRIPT = `(() => {
  for (const kind of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[kind];
      const keys = [];
      for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
      for (const oldKey of keys) {
        if (!oldKey || !/^artex[._]/.test(oldKey)) continue;
        try {
          const newKey = oldKey.replace(/^artex/, "mysterysecurityteam");
          const value = storage.getItem(oldKey);
          if (value === null) continue;
          if (storage.getItem(newKey) === null) storage.setItem(newKey, value);
          storage.removeItem(oldKey);
        } catch {}
      }
    } catch {}
  }
})();`;
