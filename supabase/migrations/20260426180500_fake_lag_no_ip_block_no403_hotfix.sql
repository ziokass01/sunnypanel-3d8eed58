-- HOTFIX 2026-04-26
-- Fake Lag public release: stop false "key sai" caused by IP-based security blocks.
-- Edge code now blocks by device_id only; this migration clears old active blocks that may
-- have been created by IP hash before the hotfix.

do $$
begin
  if to_regclass('public.server_app_security_blocks') is not null then
    update public.server_app_security_blocks
    set
      enabled = false,
      blocked_until = now(),
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'cleared_by', 'fake_lag_no_ip_block_no403_hotfix_20260426',
        'reason', 'clear old device/ip blocks that made correct public keys look invalid'
      )
    where app_code = 'fake-lag'
      and enabled = true;
  end if;
end $$;

-- Keep version policy values intact. Do not weaken package/signature/version guard here.
-- The code change only prevents HTTP 403 preflight spam and IP-wide false blocks.
