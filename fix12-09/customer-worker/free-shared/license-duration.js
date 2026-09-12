/**
 * Resolve the duration of a plain hour/day key type.
 *
 * Historical rows may contain a stale duration_seconds value while the admin
 * form shows the authoritative kind/value pair. Package and credit rows are
 * intentionally excluded because their value field is not necessarily time.
 */
export function resolveKeyTypeDurationSeconds(row) {
    const stored = Math.floor(Number(row?.duration_seconds ?? 0));
    const value = Math.floor(Number(row?.value ?? 0));
    const kind = String(row?.kind ?? "").toLowerCase();
    const mode = String(row?.free_selection_mode ?? "none").toLowerCase();
    if (["none", "legacy", ""].includes(mode) && value > 0 && (kind === "hour" || kind === "day")) {
        return Math.max(60, Math.min(2147483647, value * (kind === "hour" ? 3600 : 86400)));
    }
    return Math.max(60, Number.isFinite(stored) && stored > 0 ? stored : 3600);
}
