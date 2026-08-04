import fs from "node:fs";
import crypto from "node:crypto";

const [responseFile, requestBodyFile, nonce, key, device, buildId] = process.argv.slice(2);
if (!responseFile || !requestBodyFile || !nonce || !key || !device || !buildId) {
  console.error("Usage: node scripts/verify-server-response-v2.mjs response.json request-body.json nonce key device build_id");
  process.exit(2);
}

const response = JSON.parse(fs.readFileSync(responseFile, "utf8"));
const requestBody = fs.readFileSync(requestBodyFile, "utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonical = [
  "v2",
  nonce,
  sha256(requestBody),
  sha256(key),
  sha256(device),
  buildId,
  "true",
  String(response.remaining_seconds),
  response.expires_at ?? "",
  String(response.server_time),
  response.session_id,
  String(response.session_expires_at),
  response.feature_seed,
].join("\n");

const publicKey = fs.readFileSync(new URL("../security/sunny_server_public_p256.pem", import.meta.url), "utf8");
const signature = Buffer.from(response.server_sig, "base64");
const valid = crypto.verify("sha256", Buffer.from(canonical), publicKey, signature);
console.log(JSON.stringify({ valid, algorithm: response.server_sig_alg, key_id: response.server_key_id }, null, 2));
process.exit(valid ? 0 : 1);
