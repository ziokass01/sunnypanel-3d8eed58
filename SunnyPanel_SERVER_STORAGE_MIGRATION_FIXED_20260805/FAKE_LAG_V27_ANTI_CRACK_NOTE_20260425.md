# Fake Lag v2.7 anti-crack hardening

Patch này chỉ đụng phần server/repo trong file được gửi, không thay app Android vì zip repo không chứa source app. Mục tiêu là chặn bản re-sign / version giả ngay ở server và chuẩn bị sẵn heartbeat cho app bản kế tiếp.

## Đã sửa

- `fake-lag-auth`: dùng `block_unknown_signature` đúng như UI Runtime app, không còn chỉ đọc field cũ `require_signature_match`.
- Chuẩn hóa SHA-256 chữ ký: app gửi có dấu `:` hay không đều so được.
- Chặn thiếu identity khi policy bật: thiếu package, thiếu signature, thiếu version code sẽ không được qua.
- Version check trong auth/check không còn bỏ qua khi client gửi `version_code = 0` hoặc không gửi version.
- Token session có `nonce`, TTL tách riêng:
  - login/refresh mặc định 900 giây
  - engine/heartbeat mặc định 180 giây
- `fake-lag-auth` nhận thêm mode `heartbeat` để app bản sau ping định kỳ khi engine đang chạy.
- Thêm migration `20260425143000_fake_lag_v27_auth_strict_policy.sql` để bổ sung các cột policy an toàn.

## Cách dùng để chặn bản cũ / bản bị ký lại

Trong `Runtime app > Version guard server-side`:

1. Dán đúng SHA-256 release signing certificate.
2. Bật `SHA-256 chữ ký release hợp lệ` / `block_unknown_signature`.
3. Sau khi có app mới, tăng `Min version code` lên version code mới.
4. Bỏ version/build cũ vào danh sách block nếu cần.

Không tự nâng `min_version_code` trong migration để tránh khóa nhầm bản đang test.

## Deploy

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy fake-lag-auth --no-verify-jwt
npx supabase functions deploy fake-lag-check --no-verify-jwt
```

## App bản kế tiếp nên gọi thêm

Khi engine đang bật, app nên gọi `fake-lag-auth` mode `heartbeat` mỗi `next_heartbeat_seconds`. Nếu server trả `ok=false`, app tự dừng engine/overlay an toàn. Đây là lớp khóa sâu để block key/version/sign có hiệu lực ngay cả sau khi user đã bật engine.
