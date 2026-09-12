import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);

function editCountdown(state, durationSeconds) {
  return {
    ...state,
    duration_seconds: durationSeconds,
    duration_days: null,
    expires_at: state.first_used_at
      ? new Date(new Date(state.first_used_at).getTime() + durationSeconds * 1000).toISOString()
      : null,
  };
}

test("editing a started countdown changes duration from original first use", () => {
  const firstUsed = "2026-09-12T10:00:00.000Z";
  const edited = editCountdown({
    first_used_at: firstUsed,
    activated_at: firstUsed,
    expires_at: "2026-09-12T10:20:00.000Z",
    duration_seconds: 1200,
  }, 3600);

  assert.equal(edited.first_used_at, firstUsed);
  assert.equal(edited.activated_at, firstUsed);
  assert.equal(edited.expires_at, "2026-09-12T11:00:00.000Z");
});

test("reset activation keeps device bindings for a generation-safe reverify", () => {
  const state = {
    first_used_at: "2026-09-12T10:00:00.000Z",
    activated_at: "2026-09-12T10:00:00.000Z",
    expires_at: "2026-09-12T11:00:00.000Z",
    devices: ["device-a"],
  };
  const reset = { ...state, first_used_at: null, activated_at: null, expires_at: null };
  assert.deepEqual(reset.devices, ["device-a"]);
  assert.equal(reset.expires_at, null);
});

test("panel uses the shared cache and does not refetch on tab focus", async () => {
  const app = await readFile(resolve(root, "src/App.tsx"), "utf8");
  const queryClient = await readFile(resolve(root, "src/lib/queryClient.ts"), "utf8");
  const role = await readFile(resolve(root, "src/hooks/use-panel-role.ts"), "utf8");
  const auth = await readFile(resolve(root, "src/auth/AuthProvider.tsx"), "utf8");

  assert.match(app, /import\s+\{\s*queryClient\s*\}\s+from\s+"@\/lib\/queryClient"/);
  assert.doesNotMatch(app, /new\s+QueryClient\s*\(/);
  assert.match(queryClient, /refetchOnWindowFocus:\s*false/);
  assert.match(queryClient, /refetchOnMount:\s*false/);
  assert.match(role, /\["panel-role", userId\]/);
  assert.doesNotMatch(role, /localStorage/);
  assert.match(auth, /queryClient\.clear\(\)/);
  assert.match(auth, /sessionEventVersion/);
});
