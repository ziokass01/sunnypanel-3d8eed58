# Fix cuối SHORTLINK_CREATE_FAILED khi Link4M bị Cloudflare

## Nguyên nhân còn sót

Bản trước chỉ dùng direct fallback khi **mọi** lỗi provider đều được phân loại là lỗi tạm thời. Một URL legacy hoặc một dòng cấu hình thừa có thể trả lỗi khác, làm điều kiện này sai dù các provider Link4M thật đều đang bị `LINK4M_CLOUDFLARE_CHALLENGE`. Ngoài ra một secret cũ `FREE_SHORTLINK_FAIL_OPEN=false` có thể tiếp tục khóa fallback.

## Sửa lần này

- `free-start`: sau khi toàn bộ provider thất bại, luôn dùng direct gate continuity fallback.
- `free-gate`: áp dụng tương tự cho Pass 2.
- Provider hoạt động bình thường vẫn luôn được ưu tiên trước; direct gate chỉ là lựa chọn cuối.
- Không còn bị secret cũ `FREE_SHORTLINK_FAIL_OPEN=false` chặn.
- Muốn chủ động fail-closed mới đặt secret mới: `FREE_SHORTLINK_STRICT_PROVIDER=true`.
- Giao diện hiển thị thêm `detail` nếu strict mode vẫn trả lỗi.

## Deploy bắt buộc

Đây là sửa Edge Function, không phải SQL. Cần deploy lại ít nhất:

```bash
supabase functions deploy free-start --no-verify-jwt
supabase functions deploy free-gate --no-verify-jwt
```

Hoặc chạy workflow deploy Edge Functions sau khi push. Không cần chạy lại SQL migration cho lỗi này.

## Kiểm tra

```text
Vite production build: PASS
Vitest: 12/12 PASS
TypeScript syntax/transpile 3 file thay đổi: PASS
ESLint FreeLanding: 0 error (còn 1 warning hook cũ không liên quan patch)
```
