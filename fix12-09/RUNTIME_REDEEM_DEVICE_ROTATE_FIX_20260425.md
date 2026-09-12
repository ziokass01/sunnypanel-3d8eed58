# Runtime redeem device-rotate fix — 2026-04-25

## Lỗi vừa gặp
Trong app, mã quà Runtime dạng `FND-*` có thể báo:

```text
DEVICE_LIMIT_REACHED
```

trong khi key mới được phát từ `Admin Test GetKey` và chưa được dùng. Đây không phải lỗi credit/bù trừ. Nguyên nhân là `server-app-runtime` đang kiểm tra `countOtherActiveDevices()` trước khi xoay phiên runtime. Nếu tài khoản còn một `server_app_sessions.status='active'` từ APK cũ, lần cài trước, Android ID cũ hoặc session cũ chưa revoke, redeem bị chặn bởi device limit trước khi app có cơ hội tạo session mới.

## Nguyên tắc fix
Redeem trong app là đường **apply key + recover/rotate session**. Vì vậy:

1. Per-key abuse vẫn do `server_app_reserve_redeem_use()` xử lý.
2. Không được chặn redeem chỉ vì account còn active session cũ ở thiết bị khác.
3. Trước khi tạo session mới sau redeem, server revoke toàn bộ active session cũ của account bằng reason `redeem_rotate`.
4. Sau đó mới tạo session mới cho device hiện tại và trả `session_token` mới về app.

## File đã sửa

```text
supabase/functions/_shared/server_app_runtime.ts
```

Thay đổi chính:

- Thêm helper `revokeActiveAccountSessions(appCode, accountRef, reason)`.
- Bỏ pre-check device limit trước reserve/redeem.
- Đổi bước `redeem_rotate` từ revoke theo đúng `device_id` hiện tại sang revoke toàn bộ active sessions của account trước khi tạo session mới.

## Tuyệt đối không đổi ngược

Không đổi lại về logic cũ:

```ts
await revokeActiveDeviceSessions(appCode, accountRef, deviceId, "redeem_rotate")
```

vì câu này chỉ revoke session của **device hiện tại**, không xử lý được stale session ở device cũ. Nếu đổi ngược, app sẽ lại gặp `DEVICE_LIMIT_REACHED` khi user cài lại app, đổi máy, clear data, hoặc Android sinh device id mới.

## Không liên quan tới credit
Fix này không đổi wallet, không đổi bù trừ soft/VIP, không cho âm ví, không đổi reset key public Fake Lag.
