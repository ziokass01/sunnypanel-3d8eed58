# SunnyPanel Cloudflare API gateway

Worker này giữ endpoint public cố định `https://mityangho.id.vn/api/...`.

Có hai chế độ riêng cho `verify-key`:

- `VERIFY_NATIVE_ENABLED=0`: chế độ rollback an toàn, Worker proxy request sang Supabase Edge Function cũ.
- `VERIFY_NATIVE_ENABLED=1`: Worker tự xác minh request, gọi đúng một PostgreSQL RPC qua PostgREST, tạo session và ký phản hồi ECDSA V3 cho SRC V10.1. Không gọi `/functions/v1/verify-key` và không tự fallback sang Edge Function.

Các API khác vẫn proxy tới Supabase Edge Functions như trước.

## File quan trọng

- `index.js`: route, CORS, Cloudflare rate limit và proxy/feature flag.
- `verify-native.js`: hợp đồng verify của SRC V10.1, WebCrypto và lời gọi RPC duy nhất.
- `../supabase/migrations/20260805210000_cloudflare_native_verify_v10_1.sql`: RPC atomic.
- `check-signing-key.mjs`: xác nhận private key hiện có khớp public key đã nhúng trong menu.
- `index.test.js`: negative test, rollback test và kiểm tra chữ ký V3.
- `live-smoke.mjs`: gửi request giống menu và xác minh chữ ký response thật sau deploy.

## Biến bắt buộc cho native verify

Lưu dưới dạng Cloudflare secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM`
- `VERIFY_NATIVE_ENABLED`

Các biến hợp đồng phải giữ đúng:

```text
VERIFY_REQUIRED_BUILD_ID=sunny-v34-ac-20260721
VERIFY_PRODUCT_ID=sunny-free-fire
VERIFY_RESPONSE_ECDSA_KEY_ID=sunny-p256-2026-07-b
```

Worker tự kiểm tra private key bằng public key V10.1 trước khi gọi database. Key thiếu, sai định dạng hoặc không khớp sẽ trả `SERVER_ERROR` và không chạy RPC.

## Kiểm tra local

```bash
cd customer-worker
npm test
npm run check:syntax
node check-signing-key.mjs /duong-dan/private-key-v10.1.pem
SUNNY_EXPECT_VERIFY_BACKEND=cloudflare-native npm run smoke:live
```

Lệnh cuối phải in `PASS`. Không tạo private key mới: key mới sẽ không khớp public key của menu đang phát hành.

## Health check

```bash
curl -sS https://mityangho.id.vn/api/health
```

Các trường cần xem:

- `verify_native_enabled`
- `verify_native_configured`
- `verify_native_contract_ok`

`configured:true` chỉ xác nhận secrets có mặt. Việc private key thực sự khớp được kiểm tra fail-closed trong request native đầu tiên và bằng `check-signing-key.mjs` trước khi bật.

## Quy tắc triển khai

1. Migration trước.
2. Deploy Worker khi `VERIFY_NATIVE_ENABLED=0`.
3. Chạy toàn bộ kiểm tra và một key test kín.
4. Sau cùng mới đổi thành `VERIFY_NATIVE_ENABLED=1`.
5. Khi có lỗi, đổi lại `0`; không sửa SRC V10.1 và không bật fallback tự động.

Xem hướng dẫn đầy đủ tại `docs/CLOUDFLARE_NATIVE_VERIFY_V10_1_DEPLOY.md`.
