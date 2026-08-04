export function formatDurationDHMS(totalSeconds: number | null | undefined) {
  const s0 = typeof totalSeconds === "number" && Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : null;
  if (!s0) return "0m";

  const d = Math.floor(s0 / 86400);
  const h = Math.floor((s0 % 86400) / 3600);
  const m = Math.floor((s0 % 3600) / 60);

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function remainingSecondsFromExpires(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) return null;
  const expMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expMs)) return null;
  return Math.max(0, Math.floor((expMs - nowMs) / 1000));
}

export function formatRemainingFromExpires(expiresAt: string | null, nowMs: number) {
  const s = remainingSecondsFromExpires(expiresAt, nowMs);
  if (s === null) return null;
  return formatDurationDHMS(s);
}
