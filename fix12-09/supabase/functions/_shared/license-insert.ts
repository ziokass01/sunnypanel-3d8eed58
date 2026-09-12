/**
 * Insert a license across the schema variants that exist in this project.
 *
 * The production database has accumulated additive migrations over time. Some
 * projects therefore have legacy columns only, while newer projects also have
 * app_code/max_ips/max_verify and the two first-use column families. Sending a
 * single rigid payload can fail with PGRST204 or NOT NULL errors even though the
 * generated key itself is valid.
 *
 * This helper starts with the complete fixed-expiry payload, then falls back to
 * progressively smaller compatible payloads. It never weakens key validation;
 * the database trigger remains authoritative.
 */

export type LicenseInsertInput = {
  key: string;
  appCode: string;
  expiresAt: string;
  note?: string | null;
  maxDevices?: number;
  maxIps?: number;
  maxVerify?: number;
};

export type LicenseInsertResult = {
  ok: boolean;
  data?: { id: string; key: string };
  duplicate?: boolean;
  error?: unknown;
  errorCode?: string;
  errorDetail?: string;
  attempts: Array<{ variant: string; code: string; message: string }>;
};

function errorCode(error: any) {
  return String(error?.code ?? "").trim();
}

function errorMessage(error: any) {
  return String(error?.message ?? error?.details ?? error?.hint ?? error ?? "unknown")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function positiveInt(value: unknown, fallback = 1) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildVariants(input: LicenseInsertInput) {
  const appCode = String(input.appCode || "free-fire").trim().toLowerCase() || "free-fire";
  const maxDevices = positiveInt(input.maxDevices, 1);
  const maxIps = positiveInt(input.maxIps, 1);
  const maxVerify = positiveInt(input.maxVerify, 1);

  const base: Record<string, unknown> = {
    key: input.key,
    is_active: true,
    max_devices: maxDevices,
    expires_at: input.expiresAt,
    note: input.note ?? null,
  };

  return [
    {
      name: "full-current",
      payload: {
        ...base,
        app_code: appCode,
        max_ips: maxIps,
        max_verify: maxVerify,
        verify_count: 0,
        start_on_first_use: false,
        starts_on_first_use: false,
        duration_seconds: null,
        duration_days: null,
        first_used_at: null,
        activated_at: null,
        public_reset_disabled: false,
        deleted_at: null,
      },
    },
    {
      name: "current-limits",
      payload: {
        ...base,
        app_code: appCode,
        max_ips: maxIps,
        max_verify: maxVerify,
        verify_count: 0,
      },
    },
    {
      name: "current-app",
      payload: {
        ...base,
        app_code: appCode,
      },
    },
    {
      name: "legacy-base",
      payload: base,
    },
  ];
}

export async function insertLicenseCompat(sb: any, input: LicenseInsertInput): Promise<LicenseInsertResult> {
  const attempts: LicenseInsertResult["attempts"] = [];
  let lastError: unknown = null;

  // Prefer the schema-repair RPC when its migration is installed. The RPC runs
  // directly inside Postgres, so it is not affected by a stale PostgREST column
  // cache. Older deployments without the RPC transparently continue to the
  // payload variants below.
  const rpcResult = await sb.rpc("insert_free_license_compat", {
    p_key: input.key,
    p_app_code: String(input.appCode || "free-fire").trim().toLowerCase() || "free-fire",
    p_expires_at: input.expiresAt,
    p_note: input.note ?? null,
    p_max_devices: positiveInt(input.maxDevices, 1),
    p_max_ips: positiveInt(input.maxIps, 1),
    p_max_verify: positiveInt(input.maxVerify, 1),
  });

  if (!rpcResult.error) {
    const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    if (row?.id && row?.key) {
      return {
        ok: true,
        data: { id: String(row.id), key: String(row.key) },
        attempts,
      };
    }
  } else {
    const code = errorCode(rpcResult.error);
    const message = errorMessage(rpcResult.error);
    attempts.push({ variant: "rpc", code, message });
    lastError = rpcResult.error;

    if (code === "23505" || /duplicate key|unique constraint/i.test(message)) {
      return {
        ok: false,
        duplicate: true,
        error: rpcResult.error,
        errorCode: code,
        errorDetail: message,
        attempts,
      };
    }
  }

  for (const variant of buildVariants(input)) {
    const result = await sb
      .from("licenses")
      .insert(variant.payload)
      .select("id,key")
      .single();

    if (!result.error && result.data?.id && result.data?.key) {
      return {
        ok: true,
        data: { id: String(result.data.id), key: String(result.data.key) },
        attempts,
      };
    }

    lastError = result.error;
    const code = errorCode(result.error);
    const message = errorMessage(result.error);
    attempts.push({ variant: variant.name, code, message });

    // A key collision is the only failure that a new random key can solve. Let
    // the caller generate another key instead of trying the same key repeatedly.
    if (code === "23505" || /duplicate key|unique constraint/i.test(message)) {
      return {
        ok: false,
        duplicate: true,
        error: result.error,
        errorCode: code,
        errorDetail: message,
        attempts,
      };
    }
  }

  return {
    ok: false,
    error: lastError,
    errorCode: errorCode(lastError),
    errorDetail: errorMessage(lastError),
    attempts,
  };
}
