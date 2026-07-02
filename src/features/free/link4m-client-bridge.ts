export type Link4MClientBridgePayload = {
  mode: "link4m_full_page_script";
  api_token: string;
  target_url: string;
  base_url?: string;
  script_url?: string;
  advert?: number;
  pass?: number;
  created_at?: number;
};

const STORAGE_KEY = "sunny_link4m_client_bridge_v1";
const MAX_AGE_MS = 15 * 60 * 1000;

function normalizePayload(value: unknown, enforceAge = true): Link4MClientBridgePayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Link4MClientBridgePayload>;
  const apiToken = String(raw.api_token ?? "").trim();
  const targetUrl = String(raw.target_url ?? "").trim();
  if (raw.mode !== "link4m_full_page_script" || !apiToken || !targetUrl) return null;

  let target: URL;
  try {
    target = new URL(targetUrl, window.location.origin);
  } catch {
    return null;
  }

  if (target.origin !== window.location.origin || target.pathname !== "/free/gate") return null;
  if (!String(target.searchParams.get("t") ?? "").startsWith("gt_")) return null;

  const createdAt = Number(raw.created_at ?? Date.now());
  if (!Number.isFinite(createdAt) || (enforceAge && Date.now() - createdAt > MAX_AGE_MS)) return null;

  return {
    mode: "link4m_full_page_script",
    api_token: apiToken,
    target_url: target.toString(),
    base_url: String(raw.base_url ?? "https://link4m.co/").trim() || "https://link4m.co/",
    script_url: String(raw.script_url ?? "https://link4m.co/js/full-script.js").trim() || "https://link4m.co/js/full-script.js",
    advert: Number(raw.advert ?? 2) || 2,
    pass: Number(raw.pass ?? 1) === 2 ? 2 : 1,
    created_at: createdAt,
  };
}

export function saveLink4MClientBridge(value: unknown) {
  const payload = normalizePayload(value, false);
  if (!payload) return false;
  payload.created_at = Date.now();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readLink4MClientBridge() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = normalizePayload(JSON.parse(raw));
    if (!payload) sessionStorage.removeItem(STORAGE_KEY);
    return payload;
  } catch {
    return null;
  }
}

export function clearLink4MClientBridge() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
