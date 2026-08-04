# Bản vá dung lượng database + migration history — 05/08/2026

## Mục tiêu

1. GitHub Actions tự lấy các migration đã tồn tại trong remote history trước khi chạy `db push`.
2. Không dùng `migration repair`, `--include-all` hoặc `db reset --linked` trên production.
3. Giải phóng dung lượng từ log, nonce, rate-limit bucket và cache có thể tái tạo.
4. Đóng tính năng Rent ở giao diện, Cloudflare Worker và Edge Functions.
5. Giữ nguyên hoàn toàn `verify-key` đang chạy với SRC V10.1.

## Migration mới

`supabase/migrations/20260805020000_storage_emergency_cleanup_and_disable_rent.sql`

Migration này không xóa:

- `auth.users`
- `public.user_roles`
- `public.licenses`
- `public.license_devices`
- `public.license_ip_bindings`
- key đã phát hành
- wallet, entitlement, redeem business data
- tài khoản/key Rent

Migration dọn ngay các bảng log/nonce/rate-limit/cache có thể tái tạo. Với Rent, chỉ xóa session, reset code, device binding và log runtime; tài khoản/key Rent vẫn được giữ để có thể mở lại sau.

Migration tạo `public.sunny_storage_cleanup()` và chỉ cấp quyền gọi cho `service_role`. Nếu `pg_cron` đã được bật từ trước thì job dọn hằng ngày được tạo. Migration không tự bật extension mới.

## Vì sao GitHub trước đó vẫn lỗi

Lệnh đồng bộ đã chạy thành công ở Termux nhưng các file fetch chỉ nằm trong working tree. GitHub checkout không có chúng nên `db push` vẫn nhìn thấy 27 version remote thiếu ở local.

Bản mới sửa `tools/db_push_password_auth.sh` để mỗi lần deploy:

1. Ghi hash toàn bộ migration local đang pending.
2. Chạy `supabase migration fetch --linked` để lấy remote history vào runner tạm.
3. Xác nhận các migration pending không bị thay đổi.
4. Chạy migration guard.
5. Dry-run rồi mới push.

Việc fetch chỉ thay đổi checkout tạm của runner và không sửa database.

## Rent

- Menu `/rent` bị gỡ khỏi frontend.
- Worker trả HTTP `410 FEATURE_DISABLED` cho toàn bộ route Rent, kể cả khi biến `ALLOWED_FUNCTIONS` cũ còn chứa các route đó.
- Bốn Edge Functions Rent cũng trả `410` trước khi truy cập database.
- Secret `RENT_FEATURE_ENABLED=0` được đặt khi deploy.

Muốn mở lại sau này phải chủ động đổi cả secret Worker và Supabase thành `1`, sau đó đưa route giao diện trở lại. Không chỉ đổi một phía.
