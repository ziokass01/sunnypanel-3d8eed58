# Phase 10.2 - Runtime bootstrap and session recovery (2026-04-08)

## Mục tiêu
Fix case app đã có account/ref + device + entitlement nhưng local bị mất `session_token`, dẫn đến bấm `Dùng ngay` trong runtime center báo `Chưa có session runtime`.

## Thay đổi chính

### 1. `server-app-runtime` thêm action `bootstrap`
Action mới:
- `health`
- `catalog`
- `me`
- `bootstrap`
- `redeem`
- `consume`
- `heartbeat`
- `logout`

Payload bootstrap:
```json
{
  "action": "bootstrap",
  "app_code": "find-dumps",
  "account_ref": "user_002",
  "device_id": "aid-...",
  "client_version": "1.0.0"
}
```

Nếu account hiện có entitlement active, server sẽ:
1. kiểm entitlement active gần nhất
2. revoke session active cũ trên cùng thiết bị với reason `bootstrap_rotate`
3. cấp `session_token` mới
4. trả về `state` mới nhất + `session_token`

### 2. `me/catalog` fallback theo `account_ref + device_id`
`buildRuntimeState()` giờ nhận thêm:
- `sessionToken`
- `accountRef`
- `deviceId`

Nếu không có `session_token` nhưng có `account_ref`, server sẽ thử tìm session active gần nhất theo account/device để trả `state.session` về cho client.

Lưu ý:
- trường hợp này chỉ giúp client biết server đang thấy session active nào
- **không thể khôi phục plain `session_token` từ DB** vì DB chỉ giữ `session_token_hash`
- muốn lấy lại token dùng được thì phải gọi `bootstrap`

### 3. `RuntimeAppState` có thêm `session`
Response `state` giờ có thêm:
- `id`
- `account_ref`
- `device_id`
- `status`
- `started_at`
- `last_seen_at`
- `expires_at`
- `revoked_at`
- `client_version`
- `session_bound`
- `source` (`token` hoặc `latest_active`)

### 4. Admin runtime simulator
`AdminServerAppRuntime.tsx` đã thêm action `bootstrap` để test trực tiếp trên web admin.

## Error mới
- `NO_ACTIVE_ENTITLEMENT`
  - account chưa có entitlement active nên chưa thể bootstrap session runtime

## Ý nghĩa cho app Android
Luồng app nên là:
1. ưu tiên dùng `session_token` local nếu còn
2. nếu local mất token nhưng còn `account_ref + device_id`, gọi `bootstrap`
3. server trả session mới, app lưu lại rồi mới consume feature

## File đã sửa
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/functions/server-app-runtime/index.ts`
- `src/pages/AdminServerAppRuntime.tsx`

## Lưu ý deploy
Không cần migration mới.
Chỉ cần deploy lại function + web admin.
