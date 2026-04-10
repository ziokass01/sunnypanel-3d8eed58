export function normalizeClientCode(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function normalizeAllowedOrigins(value: unknown) {
  const rows = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n|,/g);
  return [...new Set(
    rows
      .map((row) => String(row ?? "").trim())
      .filter(Boolean),
  )];
}

export function isClientIntegrationSchemaMissing(error: unknown) {
  const msg = String((error as any)?.message ?? error ?? "");
  return msg.includes("client_integrations") && (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("schema cache")
  );
}

export async function getClientIntegrationByAccount(sb: any, accountId: string) {
  try {
    const { data, error } = await sb
      .schema("rent")
      .from("client_integrations")
      .select("id,account_id,client_code,label,allowed_origins,worker_secret_hash,rate_limit_per_minute,is_enabled,note,last_used_at,created_at,updated_at")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch (error) {
    if (isClientIntegrationSchemaMissing(error)) {
      throw new Error("CLIENT_INTEGRATIONS_SCHEMA_MISSING");
    }
    throw error;
  }
}

export async function upsertClientIntegration(sb: any, payload: {
  account_id: string;
  client_code: string;
  label: string;
  allowed_origins: string[];
  rate_limit_per_minute: number;
  is_enabled: boolean;
  note?: string | null;
}) {
  const patch = {
    account_id: payload.account_id,
    client_code: normalizeClientCode(payload.client_code),
    label: payload.label.trim(),
    allowed_origins: normalizeAllowedOrigins(payload.allowed_origins),
    rate_limit_per_minute: payload.rate_limit_per_minute,
    is_enabled: payload.is_enabled,
    note: payload.note ?? null,
  };

  if (!patch.client_code || patch.client_code.length < 3) throw new Error("INVALID_CLIENT_CODE");
  if (!patch.label) throw new Error("INVALID_CLIENT_LABEL");
  if (patch.allowed_origins.length === 0) throw new Error("INVALID_ALLOWED_ORIGINS");

  try {
    const existing = await getClientIntegrationByAccount(sb, payload.account_id);
    if (existing) {
      const { data, error } = await sb
        .schema("rent")
        .from("client_integrations")
        .update(patch)
        .eq("account_id", payload.account_id)
        .select("id,account_id,client_code,label,allowed_origins,rate_limit_per_minute,is_enabled,note,last_used_at,created_at,updated_at")
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await sb
      .schema("rent")
      .from("client_integrations")
      .insert(patch)
      .select("id,account_id,client_code,label,allowed_origins,rate_limit_per_minute,is_enabled,note,last_used_at,created_at,updated_at")
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    if (isClientIntegrationSchemaMissing(error)) throw new Error("CLIENT_INTEGRATIONS_SCHEMA_MISSING");
    const msg = String((error as any)?.message ?? error ?? "").toLowerCase();
    if (msg.includes("duplicate")) throw new Error("DUPLICATE_CLIENT_CODE");
    throw error;
  }
}
