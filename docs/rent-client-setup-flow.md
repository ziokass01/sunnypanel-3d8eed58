# Đề xuất flow: tạo tài khoản xong là setup khách ngay trong màn hình Edit

Mục tiêu: sau khi admin tạo một tài khoản thuê mới, không phải tạo file HTML riêng hay sửa repo thủ công. Admin chỉ cần vào màn hình `Edit user` và có thêm một khối `Setup khách` để tạo cấu hình tích hợp.

## Flow mong muốn

### 1. Tạo tài khoản như hiện tại

Admin tạo user thuê bình thường, ví dụ:

- username
- password
- thời hạn
- max devices

Phần này giữ nguyên, không phá flow cũ.

### 2. Khi bấm Edit user

Trong popup `Edit` hiện tại, thêm một block mới phía dưới các mục reset/rotate:

## (7) Setup khách / Tích hợp web khách

Các field nên có:

- `Bật tích hợp khách`: on/off
- `Client code`: ví dụ `khach_a`
- `Tên hiển thị`: ví dụ `Web khách A`
- `Allowed origins`: mỗi dòng một domain, ví dụ:
  - `https://mityangho.id.vn`
  - `https://a.mityangho.id.vn`
- `Rate limit / phút`
- `Ghi chú`

Các nút:

- `Tạo setup khách`
- `Cập nhật setup`
- `Tắt tích hợp`
- `Rotate secret`
- `Copy SQL`
- `Copy config worker`

## Kết quả sau khi bấm tạo setup khách

Hệ thống tự sinh ra:

- `client_code`
- bản ghi trong `rent.client_integrations`
- secret riêng cho integration hoặc hash tương ứng
- config mẫu cho worker
- SQL mẫu để admin chạy nếu muốn làm thủ công

## UX tốt nhất

Sau khi setup xong, ngay trong popup Edit hiển thị 3 khối:

### A. SQL mẫu

```sql
insert into rent.client_integrations (
  account_id,
  client_code,
  label,
  allowed_origins,
  rate_limit_per_minute,
  is_enabled,
  note
)
values (
  '<account_id>',
  'khach_a',
  'Web khách A',
  array['https://mityangho.id.vn'],
  60,
  true,
  'khách tạo từ popup edit user'
)
on conflict (client_code) do update
set
  label = excluded.label,
  allowed_origins = excluded.allowed_origins,
  rate_limit_per_minute = excluded.rate_limit_per_minute,
  is_enabled = excluded.is_enabled,
  note = excluded.note;
```

### B. Config worker mẫu

```env
CLIENT_CODE=khach_a
ALLOWED_ORIGINS=https://mityangho.id.vn
UPSTREAM_VERIFY_URL=https://.../functions/v1/rent-verify-key
```

### C. Checklist ngắn

- không nhét `accounts.hmac_secret` vào HTML public
- chỉ để worker giữ secret
- dùng `allowed_origins` đúng domain thật
- mỗi khách một `client_code`

## Trả lời cho câu hỏi vận hành

### Có làm kiểu này được không?

Có. Đây là cách hợp lý nhất cho mô hình của bạn.

### Sau này có khách mới thì admin phải làm gì?

Nếu UI này được thêm vào popup Edit user, thì khi có khách mới admin chỉ cần:

1. tạo user thuê như hiện tại
2. bấm `Edit`
3. điền phần `Setup khách`
4. copy SQL hoặc bấm lưu trực tiếp
5. copy config worker

Như vậy gần như là:

```text
Tạo user -> Edit -> Setup khách -> Copy config -> Xong
```

## Vì sao cách này tốt

- không tạo thêm file HTML linh tinh trong repo
- không cần tạo tay từng cấu hình rời rạc
- mọi thứ bám theo chính user thuê đó
- khóa riêng từng khách dễ hơn
- sau này audit theo từng khách rõ hơn

## Gợi ý rollout an toàn

1. Giữ nguyên popup Edit cũ.
2. Thêm block `Setup khách` ở cuối popup.
3. Nếu user chưa có integration thì hiện nút `Tạo setup khách`.
4. Nếu đã có rồi thì hiện `Cập nhật / Tắt / Rotate / Copy SQL`.
5. Chỉ sau khi test ổn mới nối block này với worker generic.
