const RELEASED_MENU_V10_1_REQUEST_HMAC_KEY = [
  "f40b1576b8136cac6166c9879d2597aad",
  "5e675ddedf1ec8c04a5174e6c715054",
].join("");

const REQUIRED_BUILD_ID = "sunny-v34-ac-20260721";
const PRODUCT_ID = "sunny-free-fire";
const SERVER_SIG_ALG = "ECDSA-P256-SHA256-V3";
const SERVER_KEY_ID = "sunny-p256-2026-07-b";
const RELEASED_MENU_V10_1_PUBLIC_KEY_SPKI_BASE64 = [
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE6nGga6EZpFZW81fxj5T9zWcCF4lV",
  "6l9C0QQ90UHlRlGGUc0xJEmw3doCrBU+KoScpeu9yx0QcBbfQt5PGOykig==",
].join("");
const VERIFY_RPC_NAME = "verify_key_v10_1_atomic";
const VERIFY_RPC_TIMEOUT_MS = 12_000;

const textEncoder = new TextEncoder();
const signingKeyCache = new Map();
const verifiedSigningKeyCache = new Map();

function trimTrailingSlash(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function envInt(env, name, fallback, min, max) {
  const parsed = Number(String(env?.[name] ?? "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function envBool(env, name, fallback = false) {
  const raw = String(env?.[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isNativeVerifyEnabled(env) {
  return envBool(env, "VERIFY_NATIVE_ENABLED", false);
}

export function nativeVerifyReadiness(env) {
  const supabaseUrl = trimTrailingSlash(env?.ACTIVE_SUPABASE_URL || env?.SUPABASE_URL || "");
  const serviceRoleKey = String(
    env?.SUPABASE_SERVICE_ROLE_KEY || env?.UPSTREAM_SERVICE_ROLE_KEY || "",
  ).trim();
  const privateKey = String(env?.VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM || "").trim();
  const configuredBuild = String(env?.VERIFY_REQUIRED_BUILD_ID || REQUIRED_BUILD_ID).trim();
  const configuredProduct = String(env?.VERIFY_PRODUCT_ID || PRODUCT_ID).trim();
  const configuredKeyId = String(env?.VERIFY_RESPONSE_ECDSA_KEY_ID || SERVER_KEY_ID).trim();

  return {
    enabled: isNativeVerifyEnabled(env),
    configured: Boolean(supabaseUrl && serviceRoleKey && privateKey),
    contract_matches_released_menu:
      configuredBuild === REQUIRED_BUILD_ID &&
      configuredProduct === PRODUCT_ID &&
      configuredKeyId === SERVER_KEY_ID,
  };
}

function toHex(bytes) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexBytes(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function sha256HexText(text) {
  return sha256HexBytes(textEncoder.encode(text));
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(message)));
}

function timingSafeEqualHex(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function isValidTs(value) {
  return /^[0-9]{1,20}$/.test(value);
}

function isValidNonce(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 128;
}

function isValidSigHex(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function getAcceptedRequestHmacKeys(env) {
  const configured = [
    String(env?.VERIFY_REQUEST_HMAC_SECRET || ""),
    String(env?.VERIFY_REQUEST_HMAC_SECRETS || ""),
  ]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length >= 32);

  return [...new Set([...configured, RELEASED_MENU_V10_1_REQUEST_HMAC_KEY])];
}

async function verifyReleasedMenuRequestHmac(env, signatureHex, canonical) {
  let matched = false;
  for (const secret of getAcceptedRequestHmacKeys(env)) {
    const expected = await hmacSha256Hex(secret, canonical);
    if (timingSafeEqualHex(expected, signatureHex)) matched = true;
  }
  return matched;
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizePem(raw) {
  return String(raw || "").trim().replace(/\\n/g, "\n");
}

function pemToDer(pem, expectedLabel) {
  const normalized = normalizePem(pem);
  const begin = `-----BEGIN ${expectedLabel}-----`;
  const end = `-----END ${expectedLabel}-----`;
  if (!normalized.includes(begin) || !normalized.includes(end)) {
    throw new Error(`BAD_PEM_${expectedLabel.replace(/ /g, "_")}`);
  }
  const body = normalized
    .replace(begin, "")
    .replace(end, "")
    .replace(/\s+/g, "");
  return base64ToBytes(body);
}

function derInteger(raw) {
  let first = 0;
  while (first < raw.length - 1 && raw[first] === 0) first += 1;
  let value = raw.slice(first);
  if ((value[0] & 0x80) !== 0) {
    const padded = new Uint8Array(value.length + 1);
    padded[0] = 0;
    padded.set(value, 1);
    value = padded;
  }
  const output = new Uint8Array(2 + value.length);
  output[0] = 0x02;
  output[1] = value.length;
  output.set(value, 2);
  return output;
}

export function p1363ToDer(signature) {
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
  if (bytes.length !== 64) return bytes;
  const r = derInteger(bytes.slice(0, 32));
  const s = derInteger(bytes.slice(32, 64));
  const output = new Uint8Array(2 + r.length + s.length);
  output[0] = 0x30;
  output[1] = r.length + s.length;
  output.set(r, 2);
  output.set(s, 2 + r.length);
  return output;
}

export function derEcdsaToP1363(derInput) {
  const der = derInput instanceof Uint8Array ? derInput : new Uint8Array(derInput);
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2) return null;
  let offset = 2;

  const readInteger = () => {
    if (offset + 2 > der.length || der[offset] !== 0x02) return null;
    offset += 1;
    const length = der[offset];
    offset += 1;
    if (length < 1 || offset + length > der.length) return null;
    let value = der.slice(offset, offset + length);
    offset += length;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) return null;
    const output = new Uint8Array(32);
    output.set(value, 32 - value.length);
    return output;
  };

  const r = readInteger();
  const s = readInteger();
  if (!r || !s || offset !== der.length) return null;
  const output = new Uint8Array(64);
  output.set(r, 0);
  output.set(s, 32);
  return output;
}

async function getSigningKey(env) {
  const privatePem = String(env?.VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM || "").trim();
  if (!privatePem) throw new Error("ECDSA_PRIVATE_KEY_MISSING");
  if (!signingKeyCache.has(privatePem)) {
    signingKeyCache.set(privatePem, (async () => {
      const pkcs8 = pemToDer(privatePem, "PRIVATE KEY");
      return crypto.subtle.importKey(
        "pkcs8",
        pkcs8,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
    })());
  }
  return signingKeyCache.get(privatePem);
}

async function getVerifiedSigningKey(env) {
  const privatePem = String(env?.VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM || "").trim();
  if (!privatePem) throw new Error("ECDSA_PRIVATE_KEY_MISSING");

  if (!verifiedSigningKeyCache.has(privatePem)) {
    verifiedSigningKeyCache.set(privatePem, (async () => {
      const signingKey = await getSigningKey(env);
      const publicKey = await importP256PublicKey(RELEASED_MENU_V10_1_PUBLIC_KEY_SPKI_BASE64);
      const challenge = textEncoder.encode(
        "sunny-v10.1-cloudflare-native-signing-key-self-test",
      );
      const signature = new Uint8Array(await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        signingKey,
        challenge,
      ));
      const matches = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        challenge,
      );
      if (!matches) throw new Error("ECDSA_PRIVATE_KEY_DOES_NOT_MATCH_RELEASED_MENU");
      return signingKey;
    })());
  }

  try {
    return await verifiedSigningKeyCache.get(privatePem);
  } catch (error) {
    // Do not keep a transient import/runtime failure cached forever. A genuinely
    // wrong key will still fail again and remains fail-closed before the RPC.
    verifiedSigningKeyCache.delete(privatePem);
    throw error;
  }
}

async function ecdsaP256SignDerBase64(signingKey, message) {
  const raw = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    textEncoder.encode(message),
  ));
  return bytesToBase64(p1363ToDer(raw));
}

async function importP256PublicKey(spkiBase64) {
  return crypto.subtle.importKey(
    "spki",
    base64ToBytes(spkiBase64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

async function verifyDeviceProof(publicKeySpkiBase64, payload, signatureDerBase64) {
  try {
    const key = await importP256PublicKey(publicKeySpkiBase64);
    const p1363 = derEcdsaToP1363(base64ToBytes(signatureDerBase64));
    if (!p1363) return false;
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      p1363,
      textEncoder.encode(payload),
    );
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredTrimmedString(object, name, minLength, maxLength) {
  if (typeof object[name] !== "string") return null;
  const value = object[name].trim();
  if (value.length < minLength || value.length > maxLength) return null;
  return value;
}

function optionalTrimmedString(object, name, minLength, maxLength) {
  if (!(name in object) || object[name] === undefined) return { ok: true, value: undefined };
  const value = requiredTrimmedString(object, name, minLength, maxLength);
  if (value === null) return { ok: false, value: undefined };
  return { ok: true, value };
}

function parseReleasedMenuInput(rawText) {
  let body;
  try {
    body = rawText.length ? JSON.parse(rawText) : {};
  } catch {
    return { ok: false, msg: "INVALID_JSON", httpStatus: 400, reason: "INVALID_JSON" };
  }

  if (!isPlainObject(body)) {
    return { ok: false, msg: "INVALID_INPUT", httpStatus: 400, reason: "INVALID_INPUT" };
  }

  const key = requiredTrimmedString(body, "key", 1, 64);
  const device = requiredTrimmedString(body, "device", 1, 128);
  const deviceName = optionalTrimmedString(body, "device_name", 1, 128);
  const buildId = optionalTrimmedString(body, "build_id", 1, 80);
  const productId = optionalTrimmedString(body, "product_id", 1, 80);
  const devicePublicKey = optionalTrimmedString(body, "device_public_key", 40, 2048);
  const deviceProof = optionalTrimmedString(body, "device_proof", 40, 2048);

  const proofAlgPresent = Object.prototype.hasOwnProperty.call(body, "device_proof_alg") &&
    body.device_proof_alg !== undefined;
  const proofAlgValid = !proofAlgPresent || body.device_proof_alg === "SHA256withECDSA";

  if (
    key === null ||
    device === null ||
    !deviceName.ok ||
    !buildId.ok ||
    !productId.ok ||
    !devicePublicKey.ok ||
    !deviceProof.ok ||
    !proofAlgValid ||
    !/^(SUNNY|FAKELAG)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key)
  ) {
    return { ok: false, msg: "INVALID_INPUT", httpStatus: 400, reason: "INVALID_INPUT" };
  }

  return {
    ok: true,
    data: {
      key: key.toUpperCase(),
      device,
      deviceName: deviceName.value,
      buildId: buildId.value || "",
      productId: productId.value || "",
      devicePublicKey: devicePublicKey.value || "",
      deviceProof: deviceProof.value || "",
      deviceProofAlg: proofAlgPresent ? body.device_proof_alg : "",
    },
  };
}

function isUnstableDeviceId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return [
    "unknown_device",
    "unknown",
    "null",
    "undefined",
    "9774d56d682e549c",
  ].includes(normalized);
}

export function signedResponseCanonicalV3(args) {
  return [
    "v3",
    args.nonce,
    args.requestBodyHash,
    args.keyHash,
    args.deviceHash,
    args.buildId,
    args.productId,
    "true",
    String(args.remainingSeconds),
    args.expiresAt ?? "",
    String(args.maxDevices),
    args.started ? "true" : "false",
    args.serverTime,
    args.sessionId,
    args.sessionExpiresAt,
    args.sessionGeneration,
    args.expGeneration,
    args.buildNotBefore,
    args.buildExpiresAt,
    args.capabilityNonce,
    args.capabilityExpiresAt,
    args.featureSeed,
    args.deviceKeyBound ? "true" : "false",
  ].join("\n");
}

function asSafeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return null;
  return number;
}

function sanitizeRpcError(row) {
  const statusCandidate = asSafeInteger(row?.http_status);
  const status = statusCandidate && statusCandidate >= 200 && statusCandidate <= 599
    ? statusCandidate
    : 200;
  const payload = {
    ok: false,
    msg: typeof row?.msg === "string" && row.msg ? row.msg : "SERVER_ERROR",
  };

  const retryAfter = asSafeInteger(row?.retry_after_seconds);
  if (retryAfter !== null && retryAfter > 0) payload.retry_after_seconds = retryAfter;

  const usedDevices = asSafeInteger(row?.used_devices);
  if (usedDevices !== null && usedDevices >= 0) payload.used_devices = usedDevices;

  const maxDevices = asSafeInteger(row?.max_devices);
  if (maxDevices !== null && maxDevices >= 0) payload.max_devices = maxDevices;

  return { status, payload };
}

function resolveNativeSupabase(env) {
  const supabaseUrl = trimTrailingSlash(env?.ACTIVE_SUPABASE_URL || env?.SUPABASE_URL || "");
  const serviceRoleKey = String(
    env?.SUPABASE_SERVICE_ROLE_KEY || env?.UPSTREAM_SERVICE_ROLE_KEY || "",
  ).trim();
  return { supabaseUrl, serviceRoleKey };
}

async function callVerifyRpc(env, payload) {
  const { supabaseUrl, serviceRoleKey } = resolveNativeSupabase(env);
  if (!supabaseUrl || !serviceRoleKey) throw new Error("NATIVE_SUPABASE_SECRET_MISSING");

  const timeoutMs = envInt(
    env,
    "VERIFY_RPC_TIMEOUT_MS",
    VERIFY_RPC_TIMEOUT_MS,
    1000,
    30_000,
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("VERIFY_RPC_TIMEOUT", "AbortError"));
  }, timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${VERIFY_RPC_NAME}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "X-Client-Info": "sunnypanel-cloudflare-native-verify/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!response.ok || !data) {
      console.error("verify native RPC failed", response.status, String(raw || "").slice(0, 240));
      throw new Error("VERIFY_RPC_FAILED");
    }
    return Array.isArray(data) ? data[0] : data;
  } finally {
    clearTimeout(timeoutId);
  }
}

function strictSuccessData(row) {
  const maxDevices = asSafeInteger(row?.max_devices);
  const remainingSeconds = asSafeInteger(row?.remaining_seconds);
  const serverEpoch = asSafeInteger(row?.server_epoch);
  const sessionGeneration = asSafeInteger(row?.session_generation);
  const expGeneration = asSafeInteger(row?.exp_generation);
  const buildNotBefore = asSafeInteger(row?.build_not_before);
  const buildExpiresAt = asSafeInteger(row?.build_expires_at);
  const expiresAt = row?.expires_at === null || row?.expires_at === undefined
    ? null
    : String(row.expires_at);

  if (
    row?.ok !== true ||
    typeof row?.started !== "boolean" ||
    typeof row?.device_key_bound !== "boolean" ||
    maxDevices === null || maxDevices < 0 ||
    remainingSeconds === null || remainingSeconds < 0 ||
    serverEpoch === null || serverEpoch <= 0 ||
    sessionGeneration === null || sessionGeneration <= 0 ||
    expGeneration === null || expGeneration <= 0 ||
    buildNotBefore === null || buildNotBefore <= 0 ||
    buildExpiresAt === null || buildExpiresAt <= buildNotBefore
  ) {
    return null;
  }

  return {
    expiresAt,
    maxDevices,
    started: row.started,
    remainingSeconds,
    serverEpoch,
    sessionGeneration,
    expGeneration,
    buildNotBefore,
    buildExpiresAt,
    deviceKeyBound: row.device_key_bound,
  };
}

export async function handleNativeVerify(req, env, context) {
  const { bodyBytes, realIp, json } = context;
  const configuredBuild = String(env?.VERIFY_REQUIRED_BUILD_ID || REQUIRED_BUILD_ID).trim();
  const configuredProduct = String(env?.VERIFY_PRODUCT_ID || PRODUCT_ID).trim();
  const configuredKeyId = String(env?.VERIFY_RESPONSE_ECDSA_KEY_ID || SERVER_KEY_ID).trim();

  if (
    configuredBuild !== REQUIRED_BUILD_ID ||
    configuredProduct !== PRODUCT_ID ||
    configuredKeyId !== SERVER_KEY_ID
  ) {
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }

  const rawText = new TextDecoder().decode(bodyBytes);
  const requestBodyHash = await sha256HexBytes(bodyBytes);
  const timestamp = String(req.headers.get("x-ts") || "").trim();
  const nonce = String(req.headers.get("x-nonce") || "").trim();
  const requestSignature = String(req.headers.get("x-sig") || "").trim().toLowerCase();

  if (!isValidTs(timestamp) || !isValidNonce(nonce) || !isValidSigHex(requestSignature)) {
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  const requestCanonical = `${timestamp}.${nonce}.${requestBodyHash}`;
  if (!(await verifyReleasedMenuRequestHmac(env, requestSignature, requestCanonical))) {
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(nowUnix - timestampNumber) > 300) {
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  let signingKey;
  try {
    signingKey = await getVerifiedSigningKey(env);
  } catch (error) {
    console.error("verify native signing key unavailable", String(error?.message || error));
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }

  const parsed = parseReleasedMenuInput(rawText);
  let input = {
    key: "",
    device: "",
    deviceName: undefined,
    buildId: "",
    productId: "",
    devicePublicKey: "",
    deviceProof: "",
    deviceProofAlg: "",
  };
  let precheckMsg = null;
  let precheckStatus = 200;
  let precheckReason = null;

  if (!parsed.ok) {
    precheckMsg = parsed.msg;
    precheckStatus = parsed.httpStatus;
    precheckReason = parsed.reason;
  } else {
    input = parsed.data;
    if (isUnstableDeviceId(input.device)) {
      precheckMsg = "DEVICE_ID_UNSTABLE";
      precheckStatus = 200;
      precheckReason = "PLACEHOLDER_DEVICE_ID";
    } else {
      const headerBuildId = String(req.headers.get("x-build-id") || "").trim();
      if (
        !input.buildId ||
        !headerBuildId ||
        input.buildId !== headerBuildId ||
        input.buildId !== REQUIRED_BUILD_ID ||
        input.productId !== PRODUCT_ID
      ) {
        precheckMsg = "APP_UPDATE_REQUIRED";
        precheckStatus = 200;
        precheckReason = "BAD_BUILD_ID";
      }
    }
  }

  let keyHash = "";
  let deviceHash = "";
  let hasProofEnvelope = false;
  let proofValid = false;
  let submittedPublicKeyHash = "";

  if (parsed.ok) {
    keyHash = await sha256HexText(input.key);
    deviceHash = await sha256HexText(input.device);
    hasProofEnvelope = Boolean(
      input.devicePublicKey &&
      input.deviceProof &&
      input.deviceProofAlg === "SHA256withECDSA"
    );
    if (hasProofEnvelope) {
      const proofPayload = [
        "sunny-device-proof-v1",
        timestamp,
        nonce,
        keyHash,
        deviceHash,
        input.buildId,
        input.productId,
      ].join("\n");
      proofValid = await verifyDeviceProof(
        input.devicePublicKey,
        proofPayload,
        input.deviceProof,
      );
      if (proofValid) submittedPublicKeyHash = await sha256HexText(input.devicePublicKey);
    }
  }

  const sessionId = crypto.randomUUID();
  const featureSeed = randomHex(32);
  const capabilityNonce = randomHex(32);
  const sessionTtlSeconds = envInt(env, "VERIFY_SESSION_TTL_SECONDS", 900, 180, 1800);

  let rpcResult;
  try {
    rpcResult = await callVerifyRpc(env, {
      p_key: input.key || null,
      p_device: input.device || null,
      p_device_name: input.deviceName || null,
      p_ip: realIp,
      p_ip_hash: await sha256HexText(realIp),
      p_nonce: nonce,
      p_ts: Math.trunc(timestampNumber),
      p_build_id: input.buildId || null,
      p_product_id: input.productId || null,
      p_precheck_msg: precheckMsg,
      p_precheck_status: precheckStatus,
      p_precheck_reason: precheckReason,
      p_has_proof_envelope: hasProofEnvelope,
      p_proof_valid: proofValid,
      p_submitted_public_key: proofValid ? input.devicePublicKey : null,
      p_submitted_public_key_sha256: proofValid ? submittedPublicKeyHash : null,
      p_require_device_key: envBool(env, "VERIFY_REQUIRE_DEVICE_KEY", false),
      p_ip_rate_limit: envInt(env, "VERIFY_IP_RATE_LIMIT", 300, 30, 5000),
      p_ip_rate_window_seconds: envInt(env, "VERIFY_IP_RATE_WINDOW_SECONDS", 60, 10, 3600),
      p_key_rate_limit: envInt(env, "VERIFY_KEY_RATE_LIMIT", 60, 5, 1000),
      p_key_rate_window_seconds: envInt(env, "VERIFY_KEY_RATE_WINDOW_SECONDS", 300, 60, 3600),
      p_new_device_limit: envInt(env, "VERIFY_NEW_DEVICE_LIMIT", 20, 1, 200),
      p_new_device_window_seconds: envInt(env, "VERIFY_NEW_DEVICE_WINDOW_SECONDS", 3600, 60, 86400),
      p_enum_failure_5m_limit: envInt(env, "VERIFY_ENUM_FAILURE_5M_LIMIT", 80, 10, 10000),
      p_enum_distinct_10m_limit: envInt(env, "VERIFY_ENUM_DISTINCT_10M_LIMIT", 100, 10, 10000),
      p_enum_block_minutes: envInt(env, "VERIFY_ENUM_BLOCK_MINUTES", 15, 1, 1440),
      p_session_id_prefix: sessionId.slice(0, 8),
      p_audit_success: envBool(env, "VERIFY_AUDIT_SUCCESS", true),
    });
  } catch (error) {
    const isTimeout = String(error?.name || "") === "AbortError" ||
      String(error?.message || "").includes("TIMEOUT");
    return json({ ok: false, msg: "SERVER_ERROR" }, isTimeout ? 504 : 503);
  }

  if (rpcResult?.ok !== true) {
    const error = sanitizeRpcError(rpcResult);
    return json(error.payload, error.status);
  }

  const data = strictSuccessData(rpcResult);
  if (!data || !keyHash || !deviceHash) {
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }

  const serverTime = String(data.serverEpoch);
  const sessionExpiresAtValue = data.serverEpoch + sessionTtlSeconds;
  const sessionExpiresAt = String(sessionExpiresAtValue);
  const sessionGeneration = String(data.sessionGeneration);
  const expGeneration = String(data.expGeneration);
  const buildNotBefore = String(data.buildNotBefore);
  const buildExpiresAt = String(data.buildExpiresAt);
  const capabilityExpiresAt = sessionExpiresAt;

  const responseCanonical = signedResponseCanonicalV3({
    nonce,
    requestBodyHash,
    keyHash,
    deviceHash,
    buildId: REQUIRED_BUILD_ID,
    productId: PRODUCT_ID,
    remainingSeconds: data.remainingSeconds,
    expiresAt: data.expiresAt,
    maxDevices: data.maxDevices,
    started: data.started,
    serverTime,
    sessionId,
    sessionExpiresAt,
    sessionGeneration,
    expGeneration,
    buildNotBefore,
    buildExpiresAt,
    capabilityNonce,
    capabilityExpiresAt,
    featureSeed,
    deviceKeyBound: data.deviceKeyBound,
  });

  let serverSignature;
  try {
    serverSignature = await ecdsaP256SignDerBase64(signingKey, responseCanonical);
  } catch (error) {
    console.error("verify native response signing failed", String(error?.message || error));
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }

  return json({
    ok: true,
    msg: "OK",
    expires_at: data.expiresAt,
    max_devices: data.maxDevices,
    started: data.started,
    remaining_seconds: data.remainingSeconds,
    server_time: serverTime,
    build_id: REQUIRED_BUILD_ID,
    product_id: PRODUCT_ID,
    server_sig_alg: SERVER_SIG_ALG,
    server_key_id: SERVER_KEY_ID,
    key_hash: keyHash,
    device_hash: deviceHash,
    session_id: sessionId,
    session_expires_at: sessionExpiresAtValue,
    session_generation: data.sessionGeneration,
    exp_generation: data.expGeneration,
    build_not_before: data.buildNotBefore,
    build_expires_at: data.buildExpiresAt,
    capability_nonce: capabilityNonce,
    capability_expires_at: sessionExpiresAtValue,
    feature_seed: featureSeed,
    device_key_bound: data.deviceKeyBound,
    server_sig: serverSignature,
  }, 200);
}

export const nativeVerifyContract = Object.freeze({
  requiredBuildId: REQUIRED_BUILD_ID,
  productId: PRODUCT_ID,
  serverSigAlg: SERVER_SIG_ALG,
  serverKeyId: SERVER_KEY_ID,
  rpcName: VERIFY_RPC_NAME,
  releasedRequestHmacKey: RELEASED_MENU_V10_1_REQUEST_HMAC_KEY,
  releasedPublicKeySpkiBase64: RELEASED_MENU_V10_1_PUBLIC_KEY_SPKI_BASE64,
});
