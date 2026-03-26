type MaybeError =
  | string
  | {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    }
  | null
  | undefined;

const FIELD_LABELS: Record<string, string> = {
  password: "Mật khẩu",
  username: "Tên tài khoản",
  email: "Email",
  hmac_secret: "HMAC secret",
  max_devices: "Số máy tối đa",
  note: "Ghi chú",
  title: "Tiêu đề",
  url: "Đường dẫn",
  key: "Key",
};

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function prettifyField(pathValue: unknown): string {
  const last = Array.isArray(pathValue)
    ? pathValue[pathValue.length - 1]
    : typeof pathValue === "string"
      ? pathValue
      : "";

  const key = String(last || "").trim();
  if (!key) return "Trường nhập";
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractFirstNumber(text: string): number | null {
  const match = text.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function translateKnownText(text: string, fieldHint?: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const field = fieldHint || (lower.includes("password") ? "Mật khẩu" : "Trường nhập");

  if (lower.includes("admin_auth_required")) {
    return "Phiên đăng nhập admin đã hết hạn. Hãy đăng nhập lại.";
  }

  if (lower.includes("failed to fetch")) {
    return "Không kết nối được tới máy chủ. Vui lòng thử lại sau.";
  }

  if (lower.includes("string must contain at least")) {
    const min = extractFirstNumber(raw);
    return min ? `${field} phải có ít nhất ${min} ký tự.` : `${field} quá ngắn.`;
  }

  if (lower.includes("string must contain at most")) {
    const max = extractFirstNumber(raw);
    return max ? `${field} không được vượt quá ${max} ký tự.` : `${field} quá dài.`;
  }

  if (lower.includes("invalid email")) {
    return "Email chưa đúng định dạng.";
  }

  if (lower.includes("required") || lower.includes("is required")) {
    return `${field} không được để trống.`;
  }

  return null;
}

function translateIssue(issue: any): string | null {
  if (!issue || typeof issue !== "object") return null;

  const code = toText(issue.code).toLowerCase();
  const type = toText(issue.type).toLowerCase();
  const message = toText(issue.message);
  const field = prettifyField(issue.path);

  if (code === "too_small") {
    const min = Number(issue.minimum);
    if (type === "string") {
      return Number.isFinite(min) ? `${field} phải có ít nhất ${min} ký tự.` : `${field} quá ngắn.`;
    }
    return Number.isFinite(min) ? `${field} phải lớn hơn hoặc bằng ${min}.` : `${field} quá nhỏ.`;
  }

  if (code === "too_big") {
    const max = Number(issue.maximum);
    if (type === "string") {
      return Number.isFinite(max) ? `${field} không được vượt quá ${max} ký tự.` : `${field} quá dài.`;
    }
    return Number.isFinite(max) ? `${field} không được lớn hơn ${max}.` : `${field} quá lớn.`;
  }

  if (code === "invalid_type" || code === "invalid_string") {
    return `${field} chưa đúng định dạng.`;
  }

  if (message) {
    return translateKnownText(message, field) ?? message;
  }

  return null;
}

function translateParsed(data: unknown): string | null {
  if (!data) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const msg = translateIssue(item);
      if (msg) return msg;
    }
    return null;
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (Array.isArray(obj.errors)) {
      const nested = translateParsed(obj.errors);
      if (nested) return nested;
    }

    const direct = translateIssue(obj);
    if (direct) return direct;

    const msg = toText(obj.message) || toText(obj.error) || toText(obj.details);
    if (msg) return translateKnownText(msg) ?? msg;
  }

  return null;
}

export function getErrorMessage(error: MaybeError, fallback = "Đã có lỗi xảy ra. Vui lòng thử lại."): string {
  if (!error) return fallback;

  const directCode = typeof error === "object" && error ? toText((error as any).code).toLowerCase() : "";
  if (directCode === "admin_auth_required") {
    return "Phiên đăng nhập admin đã hết hạn. Hãy đăng nhập lại.";
  }

  if (typeof error === "string") {
    const parsed = tryParseJson(error);
    return translateParsed(parsed) ?? translateKnownText(error) ?? error.trim() || fallback;
  }

  const candidates = [
    toText(error.message),
    toText(error.error_description),
    toText(error.details),
    toText(error.hint),
  ].filter(Boolean);

  for (const text of candidates) {
    const parsed = tryParseJson(text);
    const friendly = translateParsed(parsed);
    if (friendly) return friendly;
  }

  for (const text of candidates) {
    const friendly = translateKnownText(text);
    if (friendly) return friendly;
  }

  if (!candidates.length) return fallback;
  return candidates[0];
}
