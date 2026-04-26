-- Find Dumps wallet fallback: VIP credit can cover missing regular/soft credit.
--
-- This migration intentionally applies only to app_code = 'find-dumps'.
-- It does NOT touch Fake Lag.
--
-- Business rule:
--   - Regular/soft credit is spent first for tools that charge regular credit.
--   - If regular credit is not enough, remaining regular cost is paid by VIP credit.
--   - Regular credit must be clamped to 0, not left negative.
--   - VIP credit is converted down to regular credit at a fixed ratio.
--   - No reverse conversion is implemented here: regular credit does not cover VIP-only charges.
--
-- Ratio:
--   1 VIP credit = 20 regular/soft credits.
--   Missing soft amount X costs X / 20 VIP.
--
-- Example:
--   Balance before: soft=0.2, vip=10
--   Tool cost: soft=1.35, vip price not used / not shown
--   Runtime debit may temporarily write soft=-1.15
--   Trigger converts 1.15 soft deficit to 0.0575 VIP, then stores:
--     soft=0, vip=9.94 after rounding

begin;

-- Allow the runtime write to reach the database when soft credit is short.
-- The trigger below is the final guard and will either convert VIP -> soft or reject if VIP is also insufficient.
update public.server_app_wallet_rules
set
  soft_allow_negative = true,
  notes = concat_ws(E'\n', nullif(notes, ''), '2026-04-26: bật fallback VIP -> credit thường khi credit thường thiếu. Tỉ lệ 1 VIP = 20 credit thường. Không bật quy đổi ngược thường -> VIP.')
where app_code = 'find-dumps';

create or replace function public.find_dumps_vip_to_soft_wallet_fallback()
returns trigger
language plpgsql
as $$
declare
  v_ratio numeric := 20.0;
  v_soft numeric := coalesce(new.soft_balance, 0);
  v_vip numeric := coalesce(new.premium_balance, 0);
  v_soft_deficit numeric := 0;
  v_vip_needed numeric := 0;
  v_remaining_soft_deficit numeric := 0;
begin
  if coalesce(new.app_code, '') <> 'find-dumps' then
    return new;
  end if;

  -- Only one-way fallback: VIP covers missing soft/regular credit.
  if v_soft < 0 then
    v_soft_deficit := abs(v_soft);
    v_vip_needed := v_soft_deficit / v_ratio;

    if v_vip >= v_vip_needed then
      v_vip := v_vip - v_vip_needed;
      v_soft := 0;
    else
      -- Spend all VIP, then fail only if true combined balance is still insufficient.
      v_remaining_soft_deficit := v_soft_deficit - (greatest(v_vip, 0) * v_ratio);
      v_vip := 0;
      raise exception 'INSUFFICIENT_SOFT_AND_VIP_BALANCE: missing % regular credit after VIP fallback', round(v_remaining_soft_deficit::numeric, 2)
        using errcode = 'P0001';
    end if;
  end if;

  -- Do not auto-convert soft -> VIP. If premium_balance is negative, keep the existing server behavior strict.
  if v_vip < 0 then
    raise exception 'INSUFFICIENT_VIP_BALANCE'
      using errcode = 'P0001';
  end if;

  new.soft_balance := round(greatest(v_soft, 0)::numeric, 2);
  new.premium_balance := round(greatest(v_vip, 0)::numeric, 2);
  return new;
end;
$$;

drop trigger if exists trg_find_dumps_vip_to_soft_wallet_fallback on public.server_app_wallet_balances;
create trigger trg_find_dumps_vip_to_soft_wallet_fallback
before insert or update of soft_balance, premium_balance
on public.server_app_wallet_balances
for each row
execute function public.find_dumps_vip_to_soft_wallet_fallback();

-- Normalize any old negative soft balances after the trigger is installed.
-- This causes the trigger to convert old soft debt to VIP if possible.
update public.server_app_wallet_balances
set
  soft_balance = soft_balance,
  premium_balance = premium_balance,
  updated_at = now(),
  updated_by_source = 'vip_to_soft_fallback_backfill'
where app_code = 'find-dumps'
  and soft_balance < 0;

commit;
