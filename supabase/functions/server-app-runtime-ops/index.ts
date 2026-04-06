Deno.serve(async (_req) => {
  return new Response(
    JSON.stringify({
      ok: true,
      marker: "ops-canary-20260406-1",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
        "access-control-allow-methods": "POST,OPTIONS",
      },
    },
  );
});
