# Fake Lag panel/server v2.8 native guard add-on — 2026-04-25

## Đã sửa

- `fake-lag-auth` nhận và audit thêm `native_guard` + `client_watermark`.
- Runtime risk auto-block không còn chỉ đếm theo device; đã tìm theo device **hoặc** IP hash và áp dụng `risk_auto_block_window_seconds` để tránh hit cũ cộng dồn vô hạn.
- `fake-lag-check` nhận risk/native/watermark từ app khi check version, ghi audit và có thể đưa device/IP vào bảng `server_app_security_blocks` nếu gặp runtime risk lặp lại.
- Migration cũ vẫn idempotent, chỉ thêm index `last_seen_at` và note.

## Deploy

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy fake-lag-auth --no-verify-jwt
npx supabase functions deploy fake-lag-check --no-verify-jwt
```

## Lưu ý

- Không đổi schema bắt buộc ngoài bảng `server_app_security_blocks` đã có từ v2.8.
- `native_guard` và `client_watermark` nằm trong `audit_logs.detail` / `server_app_version_audit_logs.meta`, không làm vỡ UI hiện tại.
- Nếu app build Java-only (`SUNNY_ENABLE_NATIVE=false`), `native_guard` sẽ báo `ready=0`; server vẫn không chặn chỉ vì thiếu `.so` để tránh khóa nhầm bản build bằng AIDE.
