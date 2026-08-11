# Vá lỗ hổng bỏ qua link Get Key — 2026-08-11

## Kết luận kiểm tra

Lỗ hổng được báo là có thật.

`/free-start` trước đây trả đồng thời `session_id`, `out_token`, `gate_token` và
`gate_url`. Vì `/free-gate` chỉ cần cặp token hợp lệ của cùng phiên, người gọi có
thể chờ hết `min_delay_seconds` rồi gửi thẳng các giá trị vừa nhận để lấy
`claim_token`, không cần đi qua GTraffic/Link4M.

Chỉ xóa field `gate_token` là chưa đủ: các browser quick-link như Link4M `/st`
và GTraffic browser bridge còn nhúng nguyên URL gate vào `outbound_url`. Token
có thể bị bóc từ URL mã hóa đó.

## Thay đổi bảo mật

- `/free-start` không còn trả `gate_token`, `gate_url`, `gate_url_pass2`.
- Kết quả `PASS2` và `SHORTLINK_FALLBACK` không còn trả `gate_url`.
- Chỉ chấp nhận short URL **opaque**. Backend dò gate token/URL qua nhiều lớp
  URL-encoding; provider nào trả URL chứa đích gate sẽ bị loại và chuyển sang
  provider kế tiếp. Nếu không còn provider an toàn, hệ thống fail-closed bằng
  `SHORTLINK_CREATE_FAILED`, tuyệt đối không mở thẳng gate.
- Link4M dùng API server-side `/api-shorten/v2` để nhận short URL opaque; không
  dùng browser quick-link `/st` chứa URL đích.
- GTraffic không còn hạ cấp sang browser bridge khi Edge IP bị chặn; hệ thống
  failover sang provider khác hoặc fail-closed.
- Chuỗi lỗi provider được che mọi `gt_...` để token không rò qua response/log.
- Migration chuyển các dòng Link4M browser bridge cũ về endpoint API opaque.
- Luồng vẫn bắt buộc gate token một lần + out token đúng phiên + thời gian kích
  hoạt + hạn token + IP/UA/fingerprint theo cấu hình; token đã dùng không tái sử
  dụng được. `free-reveal` vẫn kiểm tra final gate proof trước khi phát key.

## Không làm lệch Menu V10.4

Không sửa `customer-worker/verify-native.js`, `customer-worker/index.js`,
`supabase/functions/verify-key/index.ts`, build id, product id, HMAC, ECDSA,
session/device contract hoặc endpoint `/api/verify-key`.

SHA-256 của `customer-worker/verify-native.js` trước và sau đều là:

`3229be8e477f2e7489a90106d672ce07371752f179bd771e49565b0bdb09000b`

## File cần triển khai

- `customer-worker/free-start-native.js`
- `customer-worker/free-start-native.ts`
- `customer-worker/free-gate-native.js`
- `customer-worker/free-gate-native.ts`
- `supabase/functions/free-start/index.ts`
- `supabase/functions/free-gate/index.ts`
- `supabase/migrations/20260811090000_free_gate_opaque_shortlinks_only.sql`
- `src/pages/FreeLanding.tsx`
- `src/pages/FreeGate.tsx`

`customer-worker/free-native.test.js` là test hồi quy, không bắt buộc ở runtime
nhưng nên giữ trong source.

## Thứ tự triển khai an toàn

1. Tạm tắt phát Free Key bằng `free_enabled = false`; không tắt `/api/verify-key`.
2. Chạy migration `20260811090000_free_gate_opaque_shortlinks_only.sql`.
3. Deploy Edge Functions `free-start` và `free-gate`.
4. Deploy `customer-worker`.
5. Build/deploy frontend.
6. Chạy smoke test bên dưới rồi bật lại `free_enabled`.

Không bật lại browser bridge `/st` hoặc provider `none` trong production. Nếu
Link4M API bị Cloudflare chặn và GTraffic cũng không trả short URL opaque, để
`SHORTLINK_CREATE_FAILED` là hành vi đúng; mở direct URL sẽ tái tạo lỗ hổng.

## Smoke test bắt buộc

1. Gọi `/api/free-start`: response thành công phải **không có** `gate_token`,
   `gate_url`, `gate_url_pass2`; `outbound_url` không chứa `gt_`, `/free/gate`
   hoặc URL gate đã encode.
2. Gọi `/api/free-gate` chỉ với `session_id + out_token`: phải nhận
   `TOKENIZED_GATE_REQUIRED`, không được có `claim_token`.
3. Hoàn tất short link thật: redirect về `/free/gate?t=gt_...`, sau đó gate mới
   được phép chuyển sang `CLAIM` (hoặc `PASS2` đối với VIP).
4. Dùng lại cùng gate token: phải bị `GATE_TOKEN_ALREADY_USED`.
5. Với VIP, response `PASS2` chỉ chứa short URL opaque, không chứa gate token.
6. Kiểm tra Menu V10.4 đăng nhập/verify như trước và xác nhận chữ ký server hợp lệ.

## Kết quả kiểm thử trong gói

- Customer Worker: 30/30 test pass.
- Invariant/shortlink/duration: 20/20 test pass.
- `npm run check:syntax`: pass.
- `npm run build`: pass.
- Test verify-key native, request HMAC, ECDSA V3, device limit và fail-closed đều
  pass trong bộ 30 test Worker.

Repo gốc có sẵn hai test frontend cũ kỳ vọng auto-fallback Free Key sang
Supabase, nhưng runtime hiện chủ đích đặt Free Key qua VPS và cấm auto-fallback.
Hai test đó đã lỗi ngay theo contract hiện tại, không liên quan bản vá này và
không được sửa để tránh thay đổi kiến trúc đang chạy. Lint toàn repo cũng có sẵn
11 lỗi `@ts-nocheck`; các file frontend/JS đã sửa không phát sinh lint error mới.

## Giới hạn cần hiểu đúng

GTraffic/Link4M không cung cấp trong source hiện tại một callback có chữ ký để
server của bạn xác minh độc lập rằng quảng cáo đã được xem. Bản vá này đóng lỗ
hổng API trực tiếp bằng cách chỉ để gate secret xuất hiện ở đích của short link
opaque. Một bot đủ khả năng hoàn tất hoặc tự động hóa toàn bộ quy trình của nhà
cung cấp vẫn cần được xử lý bằng chống bot/rate-limit phía Cloudflare/provider;
không nên dùng `Referer` làm bằng chứng mật mã vì header đó có thể bị bỏ hoặc giả.
