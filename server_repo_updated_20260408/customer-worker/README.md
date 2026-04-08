# Customer verify worker

Worker này đứng giữa trang HTML của khách và API verify thật.

## Biến môi trường cần set

- `SUPABASE_VERIFY_URL` hoặc `VERIFY_URL`: URL verify thật, ví dụ `https://.../functions/v1/rent-verify-key`
- `NOVA_USERNAME`: username account dùng để verify, ví dụ `novaapp`
- `NOVA_USER_HMAC_SECRET`: hmac secret riêng của account đó
- `NOVA_HMAC_HEADER`: tùy chọn, chỉ set nếu upstream của bạn yêu cầu header `Hmac`
- `ALLOWED_ORIGINS`: danh sách origin được phép gọi, ngăn bằng dấu phẩy

## Route

- `GET /health`
- `POST /verify`

Body gửi từ HTML:

```json
{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "device_id": "customer-browser"
}
```

Worker sẽ tự thêm `username`, `ts`, `sig_user` rồi gọi tiếp sang verify URL.

## Gợi ý deploy nhanh với Cloudflare Worker

1. Tạo worker mới.
2. Dán file `index.js` vào.
3. Set các secrets / vars ở dashboard.
4. Deploy.
5. Lấy URL worker, ví dụ `https://nova-customer-verify.your-subdomain.workers.dev/verify`

## Lưu ý

`NOVA_USER_HMAC_SECRET` phải khớp với `hmac_secret` của account ở server chính. Nếu lệch sẽ báo `BAD_SIGNATURE`.
