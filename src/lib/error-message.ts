export function getErrorMessage(error: MaybeError, fallback = "Đã có lỗi xảy ra. Vui lòng thử lại."): string {
  if (!error) return fallback;

  const directCode = typeof error === "object" && error ? toText((error as any).code).toLowerCase() : "";
  if (directCode === "admin_auth_required") {
    return "Phiên đăng nhập admin đã hết hạn. Hãy đăng nhập lại.";
  }

  if (typeof error === "string") {
    const parsed = tryParseJson(error);
    const friendly = translateParsed(parsed) ?? translateKnownText(error) ?? error.trim();
    return friendly || fallback;
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

export function getErrorMessage(
  error: MaybeError,
  fallback = "Đã có lỗi xảy ra. Vui lòng thử lại."
): string {
  if (!error) return fallback;

  const directCode =
    typeof error === "object" && error ? toText((error as any).code).toLowerCase() : "";

  if (directCode === "admin_auth_required") {
    return "Phiên đăng nhập admin đã hết hạn. Hãy đăng nhập lại.";
  }

  if (typeof error === "string") {
    const parsed = tryParseJson(error);
    const friendly = translateParsed(parsed) ?? translateKnownText(error) ?? error.trim();
    return friendly || fallback;
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
