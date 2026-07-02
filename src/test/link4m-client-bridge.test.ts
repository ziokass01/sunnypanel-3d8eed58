// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLink4MClientBridge,
  readLink4MClientBridge,
  saveLink4MClientBridge,
} from "@/features/free/link4m-client-bridge";

describe("Link4M client bridge state", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/free");
  });

  it("stores only a same-origin tokenized gate target", () => {
    expect(saveLink4MClientBridge({
      mode: "link4m_full_page_script",
      api_token: "test-token",
      target_url: `${window.location.origin}/free/gate?t=gt_abc&p=1`,
      base_url: "https://link4m.co/",
      script_url: "https://link4m.co/js/full-script.js",
      advert: 2,
      pass: 1,
      created_at: Date.now(),
    })).toBe(true);

    const payload = readLink4MClientBridge();
    expect(payload?.api_token).toBe("test-token");
    expect(payload?.target_url).toContain("/free/gate?t=gt_abc");
    expect(payload?.pass).toBe(1);
  });

  it("rejects an external or non-tokenized target", () => {
    expect(saveLink4MClientBridge({
      mode: "link4m_full_page_script",
      api_token: "test-token",
      target_url: "https://example.com/free/gate?t=gt_abc",
    })).toBe(false);

    expect(saveLink4MClientBridge({
      mode: "link4m_full_page_script",
      api_token: "test-token",
      target_url: `${window.location.origin}/free/gate?t=not-a-gate-token`,
    })).toBe(false);
  });

  it("clears stored state", () => {
    expect(saveLink4MClientBridge({
      mode: "link4m_full_page_script",
      api_token: "test-token",
      target_url: `${window.location.origin}/free/gate?t=gt_abc`,
    })).toBe(true);
    clearLink4MClientBridge();
    expect(readLink4MClientBridge()).toBeNull();
  });
});
