export type FinalGateProof = {
  pass_no?: number | null;
  status?: string | null;
  activate_after_at?: string | null;
  expires_at?: string | null;
  used_at?: string | null;
};

export type ClaimSessionProof = {
  gate_flow_version?: string | null;
  passes_required?: number | null;
  passes_completed?: number | null;
  current_pass?: number | null;
  gate_ok_at?: string | null;
};

export type GateProofResult = { ok: true } | { ok: false; code: string };

function time(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function requiredFinalPass(session: ClaimSessionProof) {
  const required = Math.floor(Number(session?.passes_required ?? 1));
  return required >= 2 ? 2 : 1;
}

export function validateFinalGateProof(session: ClaimSessionProof, gate: FinalGateProof | null): GateProofResult {
  if (String(session?.gate_flow_version ?? "").trim() !== "tokenized_v1") {
    return { ok: false, code: "TOKENIZED_GATE_REQUIRED" };
  }

  const finalPass = requiredFinalPass(session);
  const completed = Math.max(0, Math.floor(Number(session?.passes_completed ?? 0)));
  if (completed < finalPass) return { ok: false, code: "GATE_PASSES_INCOMPLETE" };
  if (!gate) return { ok: false, code: "FINAL_GATE_PROOF_MISSING" };
  if (Number(gate.pass_no ?? 0) !== finalPass) return { ok: false, code: "FINAL_GATE_PASS_INVALID" };
  if (String(gate.status ?? "").trim().toLowerCase() !== "used") return { ok: false, code: "FINAL_GATE_NOT_USED" };

  const activatedAt = time(gate.activate_after_at);
  const expiresAt = time(gate.expires_at);
  const usedAt = time(gate.used_at);
  const gateOkAt = time(session.gate_ok_at);
  if (!activatedAt || !expiresAt || !usedAt || !gateOkAt) return { ok: false, code: "FINAL_GATE_TIME_INVALID" };
  if (usedAt < activatedAt) return { ok: false, code: "FINAL_GATE_USED_TOO_EARLY" };
  if (usedAt > expiresAt) return { ok: false, code: "FINAL_GATE_USED_TOO_LATE" };
  if (gateOkAt < usedAt) return { ok: false, code: "FINAL_GATE_STATE_INVALID" };

  return { ok: true };
}

export function tokenPairMatches(claimHash: string, outHash: string, session: any) {
  const storedClaimHash = String(session?.claim_token_hash ?? "").trim();
  const acceptedOutHashes = [
    String(session?.out_token_hash ?? "").trim(),
    String(session?.out_token_hash_pass2 ?? "").trim(),
  ].filter(Boolean);

  return Boolean(claimHash)
    && Boolean(outHash)
    && storedClaimHash === claimHash
    && acceptedOutHashes.includes(outHash);
}
