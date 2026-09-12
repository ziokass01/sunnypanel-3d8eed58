import { describe, expect, it } from "vitest";
import {
  requiredFinalPass,
  tokenPairMatches,
  validateFinalGateProof,
} from "../../supabase/functions/_shared/free-claim-guard";

const validSession = {
  gate_flow_version: "tokenized_v1",
  passes_required: 2,
  passes_completed: 2,
  current_pass: 2,
  gate_ok_at: "2026-08-02T12:01:11.000Z",
};

const validGate = {
  pass_no: 2,
  status: "used",
  activate_after_at: "2026-08-02T12:01:00.000Z",
  expires_at: "2026-08-02T12:11:00.000Z",
  used_at: "2026-08-02T12:01:10.000Z",
};

describe("free claim gate invariants", () => {
  it("requires the configured final pass", () => {
    expect(requiredFinalPass(validSession)).toBe(2);
    expect(validateFinalGateProof(validSession, validGate)).toEqual({ ok: true });
    expect(validateFinalGateProof({ ...validSession, passes_completed: 1 }, validGate)).toEqual({
      ok: false,
      code: "GATE_PASSES_INCOMPLETE",
    });
  });

  it("rejects a gate consumed outside its own time window", () => {
    expect(validateFinalGateProof(validSession, { ...validGate, used_at: "2026-08-02T12:00:59.000Z" })).toEqual({
      ok: false,
      code: "FINAL_GATE_USED_TOO_EARLY",
    });
    expect(validateFinalGateProof(validSession, { ...validGate, used_at: "2026-08-02T12:11:01.000Z" })).toEqual({
      ok: false,
      code: "FINAL_GATE_USED_TOO_LATE",
    });
  });

  it("requires claim token and start token from the same session", () => {
    const session = {
      claim_token_hash: "claim-a",
      out_token_hash: "out-a",
      out_token_hash_pass2: "out-b",
    };
    expect(tokenPairMatches("claim-a", "out-a", session)).toBe(true);
    expect(tokenPairMatches("claim-a", "out-b", session)).toBe(true);
    expect(tokenPairMatches("claim-a", "", session)).toBe(false);
    expect(tokenPairMatches("claim-x", "out-a", session)).toBe(false);
  });

  it("rejects legacy or missing gate proof", () => {
    expect(validateFinalGateProof({ ...validSession, gate_flow_version: "legacy" }, validGate)).toEqual({
      ok: false,
      code: "TOKENIZED_GATE_REQUIRED",
    });
    expect(validateFinalGateProof(validSession, null)).toEqual({
      ok: false,
      code: "FINAL_GATE_PROOF_MISSING",
    });
  });
});
