export const FREE_FP_KEY = "fk_fp_v1";
export const FREE_OUT_TOKEN_KEY = "fk_out_v1";
export const FREE_KEY_TYPE_CODE_KEY = "fk_type_v1";
export const FREE_TEST_MODE_KEY = "fk_test_mode_v1";
export const FREE_START_META_KEY = "fk_start_meta_v1";

function randomBase64Url(bytesLen = 18) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readFlowStorage(key: string) {
  try {
    const v = sessionStorage.getItem(key);
    if (v) return v;
  } catch {
    // ignore
  }
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeFlowStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function removeFlowStorage(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
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
    writeFlowStorage(FREE_OUT_TOKEN_KEY, tok);
  } catch {
    // ignore
  }
}

export function getOutToken(): string {
  try {
    return readFlowStorage(FREE_OUT_TOKEN_KEY);
  } catch {
    return "";
  }
}

export function clearFreeFlowStorage() {
  try {
    removeFlowStorage(FREE_OUT_TOKEN_KEY);
    removeFlowStorage(FREE_KEY_TYPE_CODE_KEY);
  } catch {
    // ignore
  }
}

export function setFreeTestMode(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(FREE_TEST_MODE_KEY, "1");
    } else {
      localStorage.removeItem(FREE_TEST_MODE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getFreeTestMode(): boolean {
  try {
    return localStorage.getItem(FREE_TEST_MODE_KEY) === "1";
  } catch {
    return false;
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

export function setFreeStartMeta(data: { startedAtMs: number; minDelaySeconds: number; pass?: number; passesRequired?: number; minDelaySecondsPass2?: number }) {
  try {
    writeFlowStorage(FREE_START_META_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function getFreeStartMeta(): { startedAtMs: number; minDelaySeconds: number; pass?: number; passesRequired?: number; minDelaySecondsPass2?: number } | null {
  try {
    const raw = readFlowStorage(FREE_START_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { startedAtMs?: number; minDelaySeconds?: number };
    const startedAtMs = Number(parsed.startedAtMs ?? 0);
    const minDelaySeconds = Number(parsed.minDelaySeconds ?? 0);
    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return null;
    if (!Number.isFinite(minDelaySeconds) || minDelaySeconds <= 0) return null;
    return { startedAtMs, minDelaySeconds };
  } catch {
    return null;
  }
}


const FREE_APP_CODE_STORAGE = "free_app_code";
const FREE_FIND_DUMPS_MODE_STORAGE = "find_dumps_free_choice_mode";
const FREE_FIND_DUMPS_REWARD_STORAGE = "find_dumps_free_reward_code";
const FREE_FIND_DUMPS_WALLET_STORAGE = "find_dumps_free_wallet_kind";

export function setSelectedAppCode(appCode: string) {
  try { localStorage.setItem(FREE_APP_CODE_STORAGE, String(appCode || "free-fire")); } catch {
    // Storage can be unavailable in privacy mode; selection remains in memory.
  }
}

export function getSelectedAppCode() {
  try { return String(localStorage.getItem(FREE_APP_CODE_STORAGE) || "free-fire").trim() || "free-fire"; } catch { return "free-fire"; }
}

export function setFindDumpsFreeSelection(mode: string, rewardCode: string, walletKind?: string | null) {
  try {
    localStorage.setItem(FREE_FIND_DUMPS_MODE_STORAGE, String(mode || "package"));
    localStorage.setItem(FREE_FIND_DUMPS_REWARD_STORAGE, String(rewardCode || "classic"));
    if (walletKind) localStorage.setItem(FREE_FIND_DUMPS_WALLET_STORAGE, String(walletKind));
    else localStorage.removeItem(FREE_FIND_DUMPS_WALLET_STORAGE);
  } catch {
    // Storage can be unavailable in privacy mode; defaults are used on read.
  }
}

export function getFindDumpsFreeSelection() {
  try {
    return {
      mode: String(localStorage.getItem(FREE_FIND_DUMPS_MODE_STORAGE) || "package").trim() || "package",
      rewardCode: String(localStorage.getItem(FREE_FIND_DUMPS_REWARD_STORAGE) || "classic").trim() || "classic",
      walletKind: String(localStorage.getItem(FREE_FIND_DUMPS_WALLET_STORAGE) || "").trim() || null,
    };
  } catch {
    return { mode: "package", rewardCode: "classic", walletKind: null };
  }
}
