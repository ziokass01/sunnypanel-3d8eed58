SunnyPanel Ontops runtime fix - 2026-09-30

Confirmed against the real Ontops API response shape:
  {"id":"Q3Qhnj_","url":"https://target.example/...","remaining":...}

Fixes:
- Do NOT treat response.url as the shortened URL. It is the original destination.
- Build the opaque short URL from response.id: https://ontops.link/<id>.
- Build Ontops API query with URL/searchParams so apikey/url are replaced safely even if an admin row contains old query params.
- Retry Ontops HTTP 5xx across three request header profiles only; other providers are unchanged.
- Keeps token server-side; no token is added to public UI output.
- Updated regression test to use the real Ontops response shape and a first-attempt HTTP 500.

Validation:
- customer-worker npm test: 31/31 PASS
- root contract tests: 10/10 PASS
- customer-worker JS syntax checks: PASS
- TypeScript parse reached only expected unresolved Deno/npm import diagnostics; no syntax errors from this patch.

Optional override:
- Cloudflare Worker: ONTOPS_SHORT_BASE_URL
- Supabase Edge: ONTOPS_SHORT_BASE_URL
Default: https://ontops.link
