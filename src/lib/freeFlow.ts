export type FreeFlowBundle = {
  version: 1;
  created_at: number;
  session_id: string;
  out_token: string;
  claim_token?: string;
  trace_id?: string;
};

function storageKey(appCode?: string | null) {
  const normalized = String(appCode || "free-fire").trim() || "free-fire";
  return `sunny_free_flow_v1:${normalized}`;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function readBundle(appCode?: string | null): FreeFlowBundle | null {
  try {
    const raw = localStorage.getItem(storageKey(appCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FreeFlowBundle> | null;
    if (!parsed || parsed.version !== 1) return null;
    if (!isNonEmptyString(parsed.session_id)) return null;
    if (!isNonEmptyString(parsed.out_token)) return null;
    const createdAt = Number(parsed.created_at);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;

    return {
      version: 1,
      created_at: createdAt,
      session_id: String(parsed.session_id).trim(),
      out_token: String(parsed.out_token).trim(),
      claim_token: isNonEmptyString(parsed.claim_token) ? String(parsed.claim_token).trim() : undefined,
      trace_id: isNonEmptyString((parsed as any).trace_id) ? String((parsed as any).trace_id).trim() : undefined,
    };
  } catch {
    return null;
  }
}

export function writeBundle(
  partial: Partial<FreeFlowBundle> & { session_id: string; out_token: string },
  appCode?: string | null,
): void {
  try {
    const prev = readBundle(appCode);

    const nextSessionId = String(partial.session_id).trim();
    const nextOutToken = String(partial.out_token).trim();

    const shouldRefreshCreatedAt =
      !prev ||
      String(prev.session_id || "").trim() !== nextSessionId ||
      String(prev.out_token || "").trim() !== nextOutToken;

    const created_at = shouldRefreshCreatedAt ? Date.now() : prev.created_at;

    const next: FreeFlowBundle = {
      version: 1,
      created_at,
      session_id: nextSessionId,
      out_token: nextOutToken,
      claim_token: isNonEmptyString(partial.claim_token)
        ? String(partial.claim_token).trim()
        : prev?.claim_token,
      trace_id: isNonEmptyString((partial as any).trace_id)
        ? String((partial as any).trace_id).trim()
        : prev?.trace_id,
    };

    if (!next.session_id || !next.out_token) return;

    localStorage.setItem(storageKey(appCode), JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearBundle(appCode?: string | null): void {
  try {
    localStorage.removeItem(storageKey(appCode));
  } catch {
    // ignore
  }
}

export function isFresh(bundle: FreeFlowBundle, maxAgeMs = 30 * 60 * 1000): boolean {
  const age = Date.now() - Number(bundle.created_at || 0);
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}
