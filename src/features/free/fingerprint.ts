export const FREE_FP_KEY = "fk_fp_v1";
export const FREE_OUT_TOKEN_KEY = "fk_out_v1";
export const FREE_KEY_TYPE_CODE_KEY = "fk_type_v1";

function randomBase64Url(bytesLen = 18) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function getOrCreateFingerprint(): string {
  try {
    const existing = localStorage.getItem(FREE_FP_KEY);
    if (existing && existing.length >= 8) return existing;
    const fp = randomBase64Url(18);
    localStorage.setItem(FREE_FP_KEY, fp);
    return fp;
  } catch {
    // If storage blocked, fall back to ephemeral fp (less secure, but avoids crashes)
    return randomBase64Url(18);
  }
}

export function setOutToken(tok: string) {
  try {
    localStorage.setItem(FREE_OUT_TOKEN_KEY, tok);
  } catch {
    // ignore
  }
}

export function getOutToken(): string {
  try {
    return localStorage.getItem(FREE_OUT_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearFreeFlowStorage() {
  try {
    localStorage.removeItem(FREE_OUT_TOKEN_KEY);
    localStorage.removeItem(FREE_KEY_TYPE_CODE_KEY);
  } catch {
    // ignore
  }
}

export function setSelectedKeyTypeCode(code: string) {
  try {
    localStorage.setItem(FREE_KEY_TYPE_CODE_KEY, code);
  } catch {
    // ignore
  }
}

export function getSelectedKeyTypeCode(): string {
  try {
    return localStorage.getItem(FREE_KEY_TYPE_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}
