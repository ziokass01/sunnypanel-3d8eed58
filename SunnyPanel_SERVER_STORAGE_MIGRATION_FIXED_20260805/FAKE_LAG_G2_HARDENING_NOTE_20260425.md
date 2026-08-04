# Fake Lag Gói 2 hardening + license usage-only

## Android
- Đã bật R8/ProGuard release trong build type release.
- Đã thêm rule ProGuard để giữ Activity/Service trong manifest nhưng obfuscate các class còn lại.
- Đổi tên helper nhạy cảm:
  - `FakeLagAuth` -> `SessionBridge`
  - `AppVersionGuard` -> `BuildGate`
- Endpoint/action string nhạy cảm không còn hardcode dạng plain text trong Java.
- Thêm phát hiện cơ bản:
  - debugger
  - Frida/Gadget trong `/proc/self/maps`
  - Xposed/LSPosed/Substrate class/maps
  - test-keys flag
- Nếu thấy debugger/Frida, app chặn xác thực/bật engine và server cũng nhận `risk_flags`.

## Server
- `fake-lag-auth` không còn áp giới hạn IP/thiết bị theo từng license.
- License Fake Lag chỉ giới hạn theo `max_verify` / `verify_count`.
- IP/thiết bị chỉ dùng ở luồng `/free` để giới hạn số lượt lấy key public trong ngày.
- `increment_fake_lag_license_use()` đã được sửa theo usage-only: chỉ kiểm tra `max_verify`, vẫn ghi IP binding để audit.

## UI
- Tab Fake Lag Licenses không còn hiển thị/chỉnh `Max devices` và `Max IP`.
- Form tạo/sửa key chỉ giữ thời hạn, lượt dùng/verify, active, reset public và note.
- Bảng license hiển thị `verify_count / max_verify`.

## Deploy
```bash
npx supabase db push
npx supabase functions deploy fake-lag-auth --no-verify-jwt
npx supabase functions deploy free-reveal --no-verify-jwt
npx supabase functions deploy generate-license-key --no-verify-jwt
npx supabase functions deploy admin-free-test --no-verify-jwt
```
