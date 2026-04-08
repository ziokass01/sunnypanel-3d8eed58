# Hướng dẫn API cho user thuê

## Tích hợp nhanh

- Verify URL: `POST <supabase_url>/functions/v1/rent-verify-key`
- Dữ liệu gửi lên gồm `username`, `key`, `device_id`, `ts`, `sig_user`
- `sig_user` là HMAC SHA256 của chuỗi `username|key|device_id|ts`

## Ý nghĩa từng field

- `username`: tài khoản thuê dùng để verify key
- `key`: key cần kiểm tra theo format `XXXX-XXXX-XXXX-XXXX`
- `device_id`: mã máy hoặc mã thiết bị, nên cố định theo từng máy
- `ts`: unix timestamp theo giây
- `sig_user`: chữ ký HMAC của `username|key|device_id|ts`

## Mã lỗi thường gặp

- `VALID`: key hợp lệ
- `KEY_NOT_FOUND`: không tìm thấy key
- `BAD_SIGNATURE`: sai chữ ký `sig_user`
- `BAD_TIMESTAMP`: timestamp lệch hoặc quá cũ
- `KEY_DISABLED`: key đang bị tắt
- `KEY_EXPIRED`: key đã hết hạn
- `DEVICE_LIMIT`: vượt quá số thiết bị cho phép

## Khuyến nghị bảo mật

- Không đưa master secret lên client
- Không nhét user secret vào HTML public
- Web public nên dùng worker hoặc proxy giữ secret
- Nếu nghi lộ secret, hãy rotate HMAC rồi cập nhật lại phía tích hợp
