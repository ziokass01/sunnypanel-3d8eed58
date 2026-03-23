type MaybeError =
  | string
  | {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
      hint?: unknown;
    }
  | null
  | undefined;

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getErrorMessage(error: MaybeError, fallback = "Đã có lỗi xảy ra. Vui lòng thử lại."): string {
  if (!error) return fallback;
  if (typeof error === "string") return error.trim() || fallback;

  const parts = [
    toText(error.message),
    toText(error.error_description),
    toText(error.details),
    toText(error.hint),
  ].filter(Boolean);

  if (!parts.length) return fallback;
  return parts[0];
}

