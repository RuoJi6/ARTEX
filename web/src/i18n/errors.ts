import type { TFunction } from "i18next";

export function localizedError(error: unknown, translate: TFunction): string {
  if (typeof error === "string") return translate(error, { defaultValue: error });
  if (error instanceof Error) {
    const { code, params } = error as Error & { code?: string; params?: Record<string, unknown> };
    return code ? translate(`error.${code}`, { ...params, defaultValue: error.message }) : error.message;
  }
  return translate("auth.backendUnavailable");
}
