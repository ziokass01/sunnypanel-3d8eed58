# PHASE 9 HANDOVER

Phase 9 này tập trung vào **lõi** và không đụng UI chính.

## Những gì đã thêm

### 1) Runtime ops có thêm action mới
- `account_snapshot`
- `redeem_preview`
- `revoke_session`
- `restore_session`
- `revoke_entitlement`
- `restore_entitlement`

### 2) `redeem_preview` để soi chính xác key sẽ ăn gì
Action này trả về:
- dữ liệu key
- package đang gắn
- reward_preview cuối cùng
- reward_notes giải thích vì sao lấy package hoặc lấy inline key
- status_checks như hết hạn, hết lượt, bị khóa...

Ví dụ body:
```json
{
  "action": "redeem_preview",
  "app_code": "find-dumps",
  "redeem_key": "REDEEM_1"
}
```

### 3) `account_snapshot` để soi một tài khoản
Action này gom nhanh:
- entitlements
- wallets
- sessions
- transactions
- events

Ví dụ body:
```json
{
  "action": "account_snapshot",
  "app_code": "find-dumps",
  "account_ref": "user_001",
  "device_id": "device_001"
}
```

### 4) revoke / restore đi qua ops
Không cần cập nhật DB trực tiếp ở UI nữa. Có thể gọi:
- `revoke_session`
- `restore_session`
- `revoke_entitlement`
- `restore_entitlement`

## Tệp đã sửa
- `supabase/functions/server-app-runtime-ops/index.ts`

## Deploy
Chỉ cần deploy lại function ops:

```bash
npx supabase functions deploy server-app-runtime-ops --project-ref ijvhlhdrncxtxosmnbtt --no-verify-jwt
```

## Test nhanh

### Soi reward key
```bash
curl -i -X POST 'https://ijvhlhdrncxtxosmnbtt.supabase.co/functions/v1/server-app-runtime-ops'   -H 'Content-Type: application/json'   -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"   -d '{"action":"redeem_preview","app_code":"find-dumps","redeem_key":"REDEEM_1"}'
```

### Soi tài khoản
```bash
curl -i -X POST 'https://ijvhlhdrncxtxosmnbtt.supabase.co/functions/v1/server-app-runtime-ops'   -H 'Content-Type: application/json'   -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"   -d '{"action":"account_snapshot","app_code":"find-dumps","account_ref":"user_001"}'
```
