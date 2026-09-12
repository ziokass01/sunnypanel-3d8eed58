# Fix note 2026-04-15

- Fixed Vite build error in `src/lib/serverAppPolicies.ts` by removing invalid `??` + `||` mix without parentheses.
- Fixed Android scrollbar crash by disabling framework scrollbar drawing in nested text areas and scroll wrappers.
- Added guest logout hard reset so stale runtime state is not reused after sign out.
- Runtime Center logout also resets runtime cache to guest-safe state.
