# Ghi chú vận hành cho popup Edit user thuê

Mục tiêu của khối `Setup khách` trong popup Edit:

- admin mở `Edit user`
- thấy ngay form cấu hình tích hợp của chính tài khoản đó
- chỉ cần bấm `Copy SQL` rồi chạy trong Supabase SQL editor nếu muốn làm thủ công
- hoặc bấm lưu trực tiếp khi nối UI với function `admin-rent-integrations`

## Hành vi cần đạt

### 1. Mỗi account chỉ có 1 integration

Schema đã được siết để một `account_id` chỉ có đúng một dòng trong `rent.client_integrations`.

Điều này giúp:

- popup Edit luôn hiển thị đúng một form cho đúng account
- SQL preview luôn ổn định, không bị mơ hồ
- tránh trùng cấu hình của cùng một user

### 2. Xóa account thì xóa luôn integration

`rent.client_integrations.account_id` tham chiếu `rent.accounts(id)` với `on delete cascade`.

Nghĩa là:

```text
xóa user thuê -> dòng integration của user đó cũng bị xóa theo
```

Admin không cần dọn tay thêm một lần nữa.

### 3. Copy SQL từ popup Edit

SQL preview nên theo đúng account đang mở trong popup:

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
on conflict (account_id) do update
set
  client_code = excluded.client_code,
  label = excluded.label,
  allowed_origins = excluded.allowed_origins,
  rate_limit_per_minute = excluded.rate_limit_per_minute,
  is_enabled = excluded.is_enabled,
  note = excluded.note;
```

## Gợi ý UX

Trong popup Edit user:

- hiện form setup khách ở block cuối
- hiện luôn SQL preview ngay dưới form
- có nút `Copy SQL`
- có nút `Copy config worker`
- có ghi chú ngắn: `Xóa user sẽ xóa luôn integration của user đó`
