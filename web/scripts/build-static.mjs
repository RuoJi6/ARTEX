import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Set NEXT_EXPORT inside Node so this also works when Make runs in WSL but
// npm/node are Windows executables. Shell-prefixed environment assignments do
// not cross that process boundary reliably.
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const result = spawnSync(process.execPath, [nextCli, "build"], {
  env: { ...process.env, NEXT_EXPORT: "1" },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
