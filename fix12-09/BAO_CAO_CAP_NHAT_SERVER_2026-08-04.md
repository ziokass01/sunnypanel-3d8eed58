# Báo cáo kiểm tra và cập nhật server — 04/08/2026

## Kết quả

Bản cập nhật sửa các lỗi thời lượng, giới hạn thiết bị/IP/verify, reset key và các lỗ hổng quyền hạn/DDoS được phát hiện trong mã nguồn. Hợp đồng verify-key đang phát hành được giữ nguyên.

Ba phần sau đã được so sánh byte-for-byte giữa bản gốc và bản sửa:

- `signedResponseCanonicalV3`: không đổi.
- Khối response thành công `okBody` và dữ liệu đưa vào chữ ký: không đổi.
- Danh sách mã lỗi verify-key: không đổi.

Các định danh vẫn là:

- Build: `sunny-v34-ac-20260721`
- Product: `sunny-free-fire`
- Signature: `ECDSA-P256-SHA256-V3`
- Key ID: `sunny-p256-2026-07-b`

## Lỗi đã sửa

1. **3000 thiết bị bị biến thành 50**
   - Form Fake Lag cũ luôn ghi `max_devices = 1`, `max_ips = null` và chỉ giữ `max_verify`.
   - Trigger database cũ tiếp tục ép `max_devices = max_verify`.
   - Đã tách độc lập `max_devices`, `max_ips`, `max_verify`; bỏ trigger trộn giới hạn; thêm migration sửa các dòng mang dấu hiệu bị lỗi cũ.

2. **Key 10 giờ hiện khoảng 22 phút / key 5 giờ hiện khoảng 1 giờ 44 phút**
   - Loại key hour/day cũ có thể giữ `duration_seconds` lỗi thời, không khớp `kind + value` đang hiển thị.
   - Phiên admin test ngắn từng được hiển thị lẫn với hạn thật của key.
   - Đã lấy `kind + value` làm nguồn thời lượng cho loại hour/day thường/legacy, giữ nguyên duration riêng của package/credit.
   - Giao diện tách rõ “thời lượng key”, “key hết hạn” và “phiên test hết hạn”.
   - Có regression test riêng cho 10 giờ, 5 giờ và package mode.

3. **Reset key lỗi và dữ liệu không đồng bộ**
   - Reset cũ xóa/cập nhật nhiều bảng bằng các lệnh rời, có thể thành công một nửa.
   - Không xóa IP binding và không reset `verify_count` của Fake Lag.
   - Không tính đúng key countdown khi `expires_at` chưa có.
   - Đã thay bằng RPC nguyên tử có khóa dòng: xóa device/IP, reset verify, cập nhật penalty/count/expiry trong cùng transaction.
   - Trang reset hiển thị riêng số device, IP và verify; key chưa kích hoạt hiện đúng thời lượng thay vì “không giới hạn”.

4. **Thông tin key/IP/thiết bị lệch nhau**
   - Trang chi tiết và audit giờ đọc số lượng live từ `license_devices` và `license_ip_bindings`.
   - Tên thiết bị được lấy từ bản ghi verify mới nhất.
   - Khi có license thật, key thật được ưu tiên thay cho `key_mask` cũ.

5. **Lỗ hổng admin qua metadata người dùng**
   - Mã cũ tin `user_metadata.is_admin`, trong khi đây là metadata người dùng có thể tự thay đổi.
   - Đã bỏ hoàn toàn nguồn quyền này; chỉ chấp nhận `app_metadata`, bảng role phía server hoặc email admin được cấu hình phía server.

6. **RPC Fake Lag có thể bị anon gọi để đốt quota**
   - RPC `SECURITY DEFINER` cũ chưa thu hồi quyền EXECUTE mặc định từ PUBLIC.
   - Đã khóa RPC cho `service_role`, kiểm tra quota trước khi ghi IP, và giữ cập nhật quota/IP nguyên tử.

7. **Có thể lách quota sau một lần bị từ chối**
   - Device từng được ghi trước khi quota check; nếu check thất bại, lần gọi sau thấy device đã tồn tại và có thể bỏ qua bước đếm.
   - Đã xóa device vừa tạo khi guard từ chối và không để một verify thất bại làm lệch bảng IP.

8. **Endpoint admin block IP/fingerprint bị rỗng**
   - `admin-free-block/index.ts` trong bản gốc là file 0 byte.
   - Đã triển khai lại với admin authentication, giới hạn body, validation và service-role DB access.

9. **Gia cố DDoS / abuse**
   - Worker giới hạn 600 request/phút/IP cho toàn API và 120 verify/phút/IP cho verify-key.
   - Verify body tối đa 8 KiB; API khác mặc định 64 KiB; đọc stream có chặn sớm.
   - Upstream timeout 12 giây, route allowlist chính xác, không lộ upstream URL.
   - `workers_dev` và preview URL bị tắt; verify yêu cầu IP thật từ Cloudflare.
   - Database rate-limit/security RPC bị thu hồi khỏi anon/authenticated.
   - Thêm index cho audit IP, nonce expiry, device và IP lookup.
   - Fake Lag rate limiter đổi sang fail-closed khi database limiter lỗi.

10. **Lỗi chất lượng mã liên quan**
    - Sửa conditional React hooks, regex chứa ký tự điều khiển, empty catch và các lint error còn tồn tại.

## Kiểm chứng đã chạy

- `npm test -- --run`: **31/31 test pass**.
- `npm run build`: **pass**, 2674 module được build.
- `npm run lint -- --quiet`: **pass**, 0 lỗi.
- `npm audit --offline --omit=dev`: **0 vulnerability** theo advisory cache hiện có.
- `npm audit --offline` trong customer-worker: **0 vulnerability**.
- Worker module syntax/import: **pass**.
- Không phát hiện service-role key, private key hoặc JWT hard-code trong source (đã loại trừ dependency/build output).

Wrangler dry-run không chạy được trong môi trường kiểm tra vì kết nối Cloudflare bị chặn. Cần chạy `wrangler deploy --dry-run` hoặc deploy thực tế tại máy/CI có quyền Cloudflare.

## Thứ tự triển khai bắt buộc

1. Backup database Supabase.
2. Chạy migrations, theo đúng thứ tự timestamp:
   - `20260804120000_verify_ddos_hardening.sql`
   - `20260804160000_license_consistency_reset_fix.sql`
3. Deploy Edge Functions đã đổi:
   - `verify-key`
   - `reset-key`
   - `free-start`
   - `free-admin-test`
   - `admin-free-test`
   - `fake-lag-auth`
   - `fake-lag-check`
   - `admin-free-block`
   - `server-app-runtime-ops`
4. Kiểm tra Worker secret `GATEWAY_SHARED_SECRET` trùng với Supabase secret `VERIFY_GATEWAY_SHARED_SECRET`, sau đó deploy `customer-worker`.
5. Deploy frontend production build.

Không deploy function trước migration reset mới, vì `reset-key` mới gọi RPC `reset_license_key_atomic`.

## Smoke test sau deploy

1. Verify một key đang phát hành trên đúng menu hiện tại: response vẫn phải có chữ ký V3 và app vào bình thường.
2. Verify cùng một device lần thứ hai: số device không tăng.
3. Tạo key test 10 giờ: “thời lượng key” gần 10 giờ; “phiên test” được hiển thị riêng.
4. Tạo key admin 5 giờ: hạn key gần 5 giờ.
5. Tạo Fake Lag với device/IP/verify = `3000/3000/50`: tải lại trang, ba giá trị vẫn là `3000/3000/50`.
6. Reset key có dữ liệu: device/IP/verify đều về 0, penalty và remaining time cập nhật trong cùng lần reset.
7. Thử tài khoản thường đặt `user_metadata.is_admin=true`: mọi admin endpoint vẫn phải trả unauthorized/forbidden.

## Khi cần gửi ảnh Supabase

Chỉ cần gửi ảnh nếu migration/deploy hoặc smoke test lỗi. Hãy che phần key đầy đủ, IP, token và secret. Ảnh hữu ích nhất:

- Database → Migrations: trạng thái của hai migration mới.
- Edge Functions → Logs: log `verify-key` hoặc `reset-key` đúng thời điểm lỗi.
- Cloudflare Worker → Metrics/Logs: status 429/502/503 nếu có.
- SQL Editor: kết quả dòng key lỗi với các cột `duration_seconds`, `duration_days`, `expires_at`, hai cờ first-use và ba giới hạn device/IP/verify (key nên được mask).

## Giới hạn thực tế

Không có thay đổi mã nguồn nào bảo đảm “không bao giờ bị DDoS”. Bản này chặn request quá lớn, giảm request/IP, fail-closed và buộc verify qua Cloudflare. Với tấn công phân tán lớn vẫn cần bật Cloudflare WAF/Bot Management/managed challenge và theo dõi Worker/Supabase metrics để điều chỉnh ngưỡng.
