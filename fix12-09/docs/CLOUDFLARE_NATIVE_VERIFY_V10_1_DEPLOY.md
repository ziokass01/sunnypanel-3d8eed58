# Triển khai Cloudflare-native `verify-key` cho SRC V10.1

## Mục tiêu và điều không được thay đổi

Luồng mới:

```text
SRC V10.1
  -> https://mityangho.id.vn/api/verify-key
  -> Cloudflare Worker
  -> POST /rest/v1/rpc/verify_key_v10_1_atomic
  -> Worker ký ECDSA-P256-SHA256-V3
  -> SRC V10.1
```

Phải giữ nguyên:

```text
build_id       sunny-v34-ac-20260721
product_id     sunny-free-fire
server_sig_alg ECDSA-P256-SHA256-V3
server_key_id  sunny-p256-2026-07-b
```

Không deploy trực tiếp với native mode đang bật. Không tạo ECDSA key mới. Không đặt `service_role` hoặc private key trong JNI, frontend, GitHub source hay ảnh chụp.

## Điểm chặn bắt buộc: private key V10.1

Cloudflare phải dùng **đúng private key PKCS#8 hiện đang ký phản hồi của Supabase Edge Function**. Supabase/GitHub thường không cho đọc ngược giá trị secret đã lưu. Cần lấy từ bản lưu private key ban đầu.

Kiểm tra trước khi đưa secret lên Cloudflare:

```bash
cd customer-worker
node check-signing-key.mjs /duong-dan/private-key-v10.1.pem
```

Chỉ tiếp tục khi có:

```text
PASS: private key matches SRC V10.1 embedded ECDSA P-256 public key.
```

`FAIL` nghĩa là dừng. Không bật native mode vì menu phát hành sẽ từ chối chữ ký.

## 1. Sao lưu và kiểm tra source

- Tạo backup database Supabase mới.
- Giữ bản Worker production hiện tại để rollback.
- Giữ Edge Function `verify-key` hiện tại, không xóa.

Chạy:

```bash
python3 tools/validate_release_static.py
python3 tools/validate_menu_server_contract.py /duong-dan/SRC-V10.1
python3 tools/validate_cloudflare_native_verify.py /duong-dan/SRC-V10.1
```

Cả ba phải kết thúc bằng `PASS`.

## 2. Áp dụng migration nhưng vẫn giữ proxy mode

Migration:

```text
supabase/migrations/20260805210000_cloudflare_native_verify_v10_1.sql
```

Có thể dùng CLI:

```bash
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
supabase db push --include-all
```

Hoặc mở file migration, dán toàn bộ vào Supabase SQL Editor và Run một lần.

Migration chỉ tạo/thay helper và RPC mới; chưa đổi route đang chạy. Sau khi chạy, kiểm tra trong SQL Editor:

```sql
select
  to_regprocedure(
    'public.verify_key_v10_1_atomic(text,text,text,text,text,text,bigint,text,text,text,integer,text,boolean,boolean,text,text,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,boolean)'
  ) is not null as rpc_exists;
```

Kết quả phải là `true`.

Xác nhận anon/authenticated không được gọi RPC:

```sql
select
  has_function_privilege(
    'anon',
    'public.verify_key_v10_1_atomic(text,text,text,text,text,text,bigint,text,text,text,integer,text,boolean,boolean,text,text,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,boolean)',
    'EXECUTE'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    'public.verify_key_v10_1_atomic(text,text,text,text,text,text,bigint,text,text,text,integer,text,boolean,boolean,text,text,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,boolean)',
    'EXECUTE'
  ) as authenticated_can_execute;
```

Cả hai phải là `false`.

## 3. Deploy code Worker với native mode OFF

Trước tiên đảm bảo production đang có:

```text
VERIFY_NATIVE_ENABLED=0
```

Cài và kiểm tra:

```bash
cd customer-worker
npm ci
npm test
npm run check:syntax
npx wrangler deploy
```

Health check:

```bash
curl -sS https://mityangho.id.vn/api/health
```

Kỳ vọng lúc này:

```text
verify_native_enabled   false
verify_native_contract_ok true
```

Sau deploy này menu vẫn đi Edge Function cũ, nên đây là bước an toàn và có thể rollback độc lập.

## 4. Đưa secrets lên Cloudflare

Đặt service-role key của đúng project đang active:

```bash
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Đặt private key PKCS#8 đã vượt qua `check-signing-key.mjs`:

```bash
npx wrangler secret put VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM
```

Dán cả khối:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

Đặt các giá trị hợp đồng và giữ native mode tắt:

```bash
printf '%s' 'sunny-v34-ac-20260721' | npx wrangler secret put VERIFY_REQUIRED_BUILD_ID
printf '%s' 'sunny-free-fire' | npx wrangler secret put VERIFY_PRODUCT_ID
printf '%s' 'sunny-p256-2026-07-b' | npx wrangler secret put VERIFY_RESPONSE_ECDSA_KEY_ID
printf '%s' '0' | npx wrangler secret put VERIFY_NATIVE_ENABLED
```

Không dùng `UPSTREAM_ANON_KEY` cho RPC native. RPC chỉ chấp nhận `service_role`.

## 5. Kiểm tra trước khi bật

Chạy lại:

```bash
curl -sS https://mityangho.id.vn/api/health
```

Phải có:

```text
verify_native_enabled    false
verify_native_configured true
verify_native_contract_ok true
```

Tiếp tục test menu/key qua luồng proxy cũ để xác nhận deploy Worker không làm lệch route.

## 6. Bật native mode trong cửa sổ theo dõi

Chọn thời điểm ít người dùng và mở sẵn Cloudflare logs, Supabase logs và một máy có SRC V10.1.

```bash
printf '%s' '1' | npx wrangler secret put VERIFY_NATIVE_ENABLED
```

Health phải chuyển thành:

```text
verify_native_enabled true
verify_native_configured true
verify_native_contract_ok true
```

Request native thành công có header:

```text
X-Verify-Backend: cloudflare-native
```

Worker không tự fallback sang Supabase Edge Function. Đây là chủ ý để khi lỗi/spam không quay lại đốt Edge Function invocations.

## 7. Smoke test bắt buộc

Test theo thứ tự:

Trước tiên chạy request giả lập đúng SRC V10.1 và bắt buộc kiểm tra backend native:

```bash
cd customer-worker
SUNNY_EXPECT_VERIFY_BACKEND=cloudflare-native npm run smoke:live
```

Kết quả key giả phải là `PASS_REQUEST_REACHED_LICENSE_CHECK`, thường với `KEY_NOT_FOUND`.

Sau đó test theo thứ tự:

1. Key không tồn tại: phải trả `KEY_NOT_FOUND`, không phải `UNAUTHORIZED` hoặc `SERVER_ERROR`.
2. Một key thật đang hoạt động trên thiết bị đã dùng: đăng nhập bình thường. Có thể chạy `SUNNY_EXPECT_VERIFY_BACKEND=cloudflare-native npm run smoke:live -- SUNNY-XXXX-XXXX-XXXX` để xác minh toàn bộ chữ ký V3.
3. Đăng nhập lại cùng thiết bị: không tăng số thiết bị.
4. Key mới start-on-first-use: thời gian phải đúng và không bị tụt sai giờ/phút.
5. Key đạt giới hạn thiết bị: phải trả `DEVICE_LIMIT` kèm đúng `used_devices`, `max_devices`.
6. Key hết hạn, key khóa và key đã xóa: thông báo phải đúng hợp đồng cũ.
7. Reset key từ panel, sau đó đăng nhập lại: thiết bị/IP/session generation phải đồng bộ.
8. Fake Lag key: cùng thiết bị không tiêu hao thêm quota; thiết bị mới vẫn qua giới hạn `max_verify`/IP.
9. Gửi lại đúng nonce: phải `UNAUTHORIZED`.
10. Sai `x-sig`, sai build hoặc sửa một field response: menu phải từ chối.

Theo dõi audit có trường:

```text
backend = cloudflare-native
```

Sau một lượt native thành công, Supabase Edge Function invocation của `verify-key` không được tăng do request đó. Database/PostgREST vẫn có hoạt động vì dữ liệu key còn nằm trong PostgreSQL.

## 8. Rollback tức thì

Khi xuất hiện `SERVER_SIG_INVALID`, `SERVER_STRICT_FIELDS_MISSING`, `SERVER_SESSION_FIELDS_BAD`, `UNAUTHORIZED` bất thường hoặc nhiều `SERVER_ERROR`:

```bash
printf '%s' '0' | npx wrangler secret put VERIFY_NATIVE_ENABLED
```

Sau đó kiểm tra health là `verify_native_enabled:false` và test lại một key thật. Không xóa migration trong lúc sự cố; chỉ cần tắt feature flag để route quay về Edge Function cũ.

## 9. Sau 24 giờ ổn định

- Giữ Edge Function cũ làm rollback, chưa xóa.
- So sánh số lần `verify-key` Edge invocation trước/sau.
- Xem Cloudflare request count và CPU time.
- Xem Postgres CPU/RAM/IO; một verify native chỉ gọi một PostgREST RPC, nhưng bên trong transaction vẫn thực hiện các kiểm tra cần thiết.
- Chỉ cân nhắc xóa proxy cũ sau nhiều ngày ổn định và có backup đầy đủ.
