#!/usr/bin/env node

import { createHash, createPrivateKey, createPublicKey, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const RELEASED_MENU_V10_1_PUBLIC_KEY_SPKI_BASE64 = [
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE6nGga6EZpFZW81fxj5T9zWcCF4lV",
  "6l9C0QQ90UHlRlGGUc0xJEmw3doCrBU+KoScpeu9yx0QcBbfQt5PGOykig==",
].join("");

function usage() {
  console.error(
    "Usage: node check-signing-key.mjs /path/to/v10.1-private-key.pem\n" +
      "The file must contain the existing PKCS#8 ECDSA P-256 private key. " +
      "The script never prints the private key.",
  );
}

function publicFingerprint(spkiDer) {
  return createHash("sha256").update(spkiDer).digest("hex");
}

const pemPath = process.argv[2];
if (!pemPath) {
  usage();
  process.exit(2);
}

try {
  const privatePem = readFileSync(pemPath, "utf8").trim().replaceAll("\\n", "\n");
  const privateKey = createPrivateKey({ key: privatePem, format: "pem" });
  if (privateKey.asymmetricKeyType !== "ec") {
    throw new Error(`Expected EC private key, got ${privateKey.asymmetricKeyType || "unknown"}`);
  }
  const curve = privateKey.asymmetricKeyDetails?.namedCurve || "";
  if (curve && curve !== "prime256v1") {
    throw new Error(`Expected P-256/prime256v1, got ${curve}`);
  }

  const derivedSpki = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const expectedSpki = Buffer.from(RELEASED_MENU_V10_1_PUBLIC_KEY_SPKI_BASE64, "base64");
  const matches = derivedSpki.length === expectedSpki.length &&
    timingSafeEqual(derivedSpki, expectedSpki);

  if (!matches) {
    console.error("FAIL: private key does not match SRC V10.1 embedded public key.");
    console.error(`Derived public-key SHA-256:  ${publicFingerprint(derivedSpki)}`);
    console.error(`Expected public-key SHA-256: ${publicFingerprint(expectedSpki)}`);
    process.exit(1);
  }

  console.log("PASS: private key matches SRC V10.1 embedded ECDSA P-256 public key.");
  console.log(`Public-key SHA-256: ${publicFingerprint(expectedSpki)}`);
} catch (error) {
  console.error(`FAIL: ${String(error?.message || error)}`);
  process.exit(1);
}
