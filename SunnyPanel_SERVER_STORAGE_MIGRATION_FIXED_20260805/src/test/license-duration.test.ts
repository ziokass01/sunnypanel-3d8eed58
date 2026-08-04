import { describe, expect, it } from "vitest";
import { resolveKeyTypeDurationSeconds } from "../../supabase/functions/_shared/license-duration";

describe("key type duration resolution", () => {
  it("uses the visible 10-hour value instead of a stale stored duration", () => {
    expect(resolveKeyTypeDurationSeconds({
      kind: "hour",
      value: 10,
      duration_seconds: 22 * 60,
      free_selection_mode: "none",
    })).toBe(10 * 3600);
  });

  it("uses the visible 5-hour value for legacy admin types", () => {
    expect(resolveKeyTypeDurationSeconds({
      kind: "hour",
      value: 5,
      duration_seconds: 104 * 60,
      free_selection_mode: "legacy",
    })).toBe(5 * 3600);
  });

  it("keeps the explicit stored duration for package types", () => {
    expect(resolveKeyTypeDurationSeconds({
      kind: "hour",
      value: 10,
      duration_seconds: 7200,
      free_selection_mode: "package",
    })).toBe(7200);
  });
});
