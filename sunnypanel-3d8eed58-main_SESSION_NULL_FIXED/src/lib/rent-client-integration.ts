export type RentClientIntegrationDraft = {
  clientCode: string;
  label: string;
  origins: string[];
  rateLimit: number;
  enabled: boolean;
  note: string;
};

export function normalizeRentClientCode(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function parseAllowedOrigins(input: string) {
  return [...new Set(
    input
      .split(/\r?\n|,/g)
      .map((row) => row.trim())
      .filter(Boolean),
  )];
}

export function stringifyAllowedOrigins(origins: string[] | null | undefined) {
  return (origins ?? []).join("\n");
}

export function buildRentClientIntegrationSql(accountId: string, draft: RentClientIntegrationDraft) {
  const sqlOrigins = draft.origins.map((origin) => `'${origin.replace(/'/g, "''")}'`).join(", ");
  const safeLabel = draft.label.replace(/'/g, "''");
  const safeClientCode = draft.clientCode.replace(/'/g, "''");
  const safeNote = draft.note.trim() ? `'${draft.note.replace(/'/g, "''")}'` : "null";

  return `insert into rent.client_integrations (\n  account_id,\n  client_code,\n  label,\n  allowed_origins,\n  rate_limit_per_minute,\n  is_enabled,\n  note\n)\nvalues (\n  '${accountId}',\n  '${safeClientCode}',\n  '${safeLabel}',\n  array[${sqlOrigins}],\n  ${draft.rateLimit},\n  ${draft.enabled ? "true" : "false"},\n  ${safeNote}\n)\non conflict (account_id) do update\nset\n  client_code = excluded.client_code,\n  label = excluded.label,\n  allowed_origins = excluded.allowed_origins,\n  rate_limit_per_minute = excluded.rate_limit_per_minute,\n  is_enabled = excluded.is_enabled,\n  note = excluded.note;`;
}

export function buildRentClientWorkerConfig(draft: Pick<RentClientIntegrationDraft, "clientCode" | "origins">) {
  return `CLIENT_CODE=${draft.clientCode}\nALLOWED_ORIGINS=${draft.origins.join(",")}\nUPSTREAM_VERIFY_URL=https://your-project.supabase.co/functions/v1/rent-verify-key`;
}
