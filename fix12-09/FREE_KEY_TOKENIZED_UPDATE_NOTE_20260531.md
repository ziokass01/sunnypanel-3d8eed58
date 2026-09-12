# Free Key Tokenized Gate Update - 2026-05-31

Scope: only public Free Key web flow and Admin Free Key settings. This patch does not change verify-key / rent verify logic.

## What changed

- Replaced stable bucket gate URLs with per-attempt gate tokens.
- One generated gate token can advance only one session/pass.
- Gate token has `activate_after_at` and `expires_at`:
  - opening gate too early burns the token and closes the session;
  - opening after expiry marks token expired and closes the session.
- Final gate claim token is deterministic from the accepted gate token and session, so refreshing/reusing an already accepted final gate token returns the same claim token instead of minting another path.
- Claim reveal still uses the existing atomic `gate_ok + reveal_count = 0` lock and idempotent return of the already-issued key.
- Added multi shortlink provider table with enable/disable, pass scope, sort order, and mode: `round_robin` or `random` no-repeat.
- Public `/free-config` no longer exposes shortlink API URLs/tokens.

## Deploy order

```bash
supabase db push
supabase functions deploy free-start
supabase functions deploy free-gate
supabase functions deploy free-reveal
supabase functions deploy free-config
```

Then rebuild/deploy the frontend.

## Main touched files

- `supabase/migrations/20260531123000_free_key_tokenized_providers.sql`
- `supabase/functions/free-start/index.ts`
- `supabase/functions/free-gate/index.ts`
- `supabase/functions/free-reveal/index.ts`
- `supabase/functions/free-config/index.ts`
- `src/pages/AdminFreeKeys.tsx`
- `src/pages/FreeGate.tsx`
- `src/pages/FreeClaim.tsx`
- `src/features/free/free-config.ts`
