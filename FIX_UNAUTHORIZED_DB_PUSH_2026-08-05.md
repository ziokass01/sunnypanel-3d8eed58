# Fix verify `UNAUTHORIZED` và lỗi `cli_login_postgres` — 2026-08-05

## Kết luận từ ảnh lỗi

1. Public API trả HTTP 200 với `{"ok":false,"msg":"UNAUTHORIZED"}` chứ không trả `GATEWAY_REQUIRED`.
   Điều này xác nhận request đã đi qua Cloudflare Worker và đã vượt qua lớp chữ ký gateway.
2. Lỗi nằm ở lớp request-HMAC phía sau gateway. Workflow cũ chỉ set GitHub secret
   `VERIFY_HMAC_SECRET`, trong khi `verify-key` chỉ đọc `VERIFY_REQUEST_HMAC_SECRET`.
   Trên project mới, biến mới chưa tồn tại nên server ghi audit reason `MISCONFIGURED`
   và cố ý trả thông báo chung `UNAUTHORIZED`.
3. `supabase db push` chưa chạy được vì project restore đã mang theo role
   `cli_login_postgres` sai quan hệ thành viên. Đây là lỗi database role, không phải lỗi
   migration mới.

## Những gì bản fix đã thay đổi

- `verify-key` đọc `VERIFY_REQUEST_HMAC_SECRET` trước, rồi fallback tạm thời sang
  `VERIFY_HMAC_SECRET` để giữ nguyên menu đang phát hành.
- Hai GitHub Actions set cả hai tên secret thành cùng một giá trị trước khi deploy function.
- Workflow tự động push migrations trước function và dừng hẳn nếu migration lỗi; không còn
  trường hợp reset-key mới được deploy khi RPC mới chưa có.
- Worker nhận diện đầy đủ `AbortError`, `TimeoutError` và `UPSTREAM_TIMEOUT`, trả đúng HTTP 504.
- Không đổi build, product, thuật toán, key ID hoặc canonical verify:
  - build: `sunny-v34-ac-20260721`
  - product: `sunny-free-fire`
  - response signature: `ECDSA-P256-SHA256-V3`
  - key ID: `sunny-p256-2026-07-b`

## Thứ tự triển khai bắt buộc

### 1. Sửa role CLI một lần

Mở Supabase Dashboard của project mới -> SQL Editor, chạy file:

```text
SQL_REPAIR_CLI_LOGIN_ROLE.sql
```

### 2. Kiểm tra GitHub repository secrets

Phải có:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`
- một trong hai biến request HMAC:
  - `VERIFY_REQUEST_HMAC_SECRET`, hoặc
  - `VERIFY_HMAC_SECRET` đang dùng bởi menu đã phát hành

Nên có thêm:

- `VERIFY_GATEWAY_SHARED_SECRET`
- `VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM`

Không đưa giá trị thật vào source, commit, ảnh hoặc log.

### 3. Push các file fix

Workflow mới sẽ chạy theo thứ tự:

1. link project;
2. push migrations;
3. đồng bộ secret/biến tương thích;
4. deploy Edge Functions.

Nếu migration thất bại thì function sẽ không được deploy.

### 4. Deploy Cloudflare Worker

Deploy lại thư mục `customer-worker`. Kiểm tra `/api/health` phải có:

```json
{"ok":true,"service":"fixed-api-gateway-v34","gateway_auth":true}
```

### 5. Smoke test

Dùng nonce mới ở mỗi lần test. Kết quả không còn `UNAUTHORIZED` do thiếu alias secret.
Với key giả, server phải đi tiếp đến lỗi trạng thái key như `INVALID_KEY`; với key thật hợp lệ,
response phải có `server_sig_alg=ECDSA-P256-SHA256-V3` và
`server_key_id=sunny-p256-2026-07-b`.

## Không làm

- Không đổi request-HMAC đang nhúng trong menu hiện tại.
- Không tắt gateway để né lỗi.
- Không deploy `reset-key` trước migration `20260804160000_license_consistency_reset_fix.sql`.
- Không chạy lại cùng một nonce vì server sẽ coi là replay.
