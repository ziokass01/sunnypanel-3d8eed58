# Rent portal: checklist tích hợp khách an toàn

Tài liệu này không đổi flow đang chạy. Mục tiêu là chỉ rõ các thiếu sót hiện tại của trang rent và cách vá theo từng bước để tránh lặp lại tình huống:

- nhầm giữa `RENT_MASTER_HMAC_SECRET` và `hmac_secret`
- nhét secret vào HTML tĩnh
- mỗi khách một file riêng trong repo làm repo rối
- khó khóa riêng từng khách khi cần
- khó audit khách nào đang gọi sai

## 1. Hiện trạng

Flow hiện tại của verify key dùng `rent.accounts.hmac_secret` để kiểm tra `sig_user`. Điều này phù hợp cho nội bộ nhưng chưa tối ưu cho mô hình có nhiều web khách.

### Điểm mạnh hiện có

- Portal đã có chỗ xem HMAC bằng mật khẩu tạm thời.
- Portal đã có API verify rõ ràng.
- Portal đã có log key và tải file CA bundle.

### Thiếu sót hiện tại

1. Chưa có khái niệm **client integration** riêng cho từng web khách.
2. Chưa có bảng cấu hình domain / origin được phép gọi.
3. Chưa có secret riêng theo khách, nên lộ một nơi là ảnh hưởng rộng.
4. Chưa có nhật ký request theo khách, domain, IP, code lỗi.
5. Chưa có nút rotate / revoke riêng từng khách.
6. Chưa có gói cấu hình mẫu sinh tự động từ portal.
7. Chưa có checklist ngay trong portal để tránh nhầm `master secret` và `user hmac secret`.

## 2. Nguyên tắc nên giữ

- Không đưa `hmac_secret` gốc vào HTML public.
- HTML của khách chỉ nên gọi tới một lớp proxy hoặc worker trung gian.
- Secret gốc chỉ tồn tại ở server nội bộ hoặc worker secret.
- Mỗi khách nên có mã tích hợp riêng, domain riêng, trạng thái bật tắt riêng.

## 3. Cấu trúc nên bổ sung dần

### Giai đoạn 1: không phá hệ thống đang chạy

- Giữ nguyên `rent-verify-key` hiện tại.
- Thêm lớp `client integrations` chỉ để quản lý cấu hình khách.
- Chưa buộc migrate toàn bộ khách cũ ngay.

### Giai đoạn 2: tách khách theo từng integration

Mỗi integration nên có:

- `client_code`
- `label`
- `account_id`
- `allowed_origins`
- `is_enabled`
- `worker_secret_hash` hoặc secret riêng
- `last_used_at`
- `rate_limit_per_minute`

### Giai đoạn 3: audit riêng

Mỗi request nên log:

- integration nào gọi
- origin nào gọi
- IP nào gọi
- device_id nào gửi lên
- key hợp lệ hay không
- code lỗi gì
- request time

## 4. Checklist vận hành cho admin

Trước khi tạo web cho khách, kiểm tra đủ các mục sau:

- [ ] Đã xác định đúng username account dùng verify.
- [ ] Đã phân biệt `RENT_MASTER_HMAC_SECRET` và `accounts.hmac_secret`.
- [ ] Không nhúng `accounts.hmac_secret` trực tiếp vào HTML public.
- [ ] Có worker hoặc proxy giữ secret phía server.
- [ ] Domain khách đã được whitelist.
- [ ] Có cơ chế khóa riêng từng khách mà không ảnh hưởng khách khác.
- [ ] Có log request để dò lỗi `BAD_SIGNATURE`, `BAD_TIMESTAMP`, `DEVICE_LIMIT`.
- [ ] Có cách rotate secret khi lộ.

## 5. Gợi ý UI cần thêm sau này trong tab API & Tải xuống

Một khối mới tên `Tích hợp khách` nên có:

- danh sách integrations
- nút tạo integration mới
- allowed origins
- trạng thái bật / tắt
- copy endpoint
- copy config mẫu cho worker
- rotate secret
- revoke integration
- request log gần đây

## 6. Gợi ý flow đúng cho web khách

```text
Portal nội bộ -> tạo integration -> worker giữ secret -> HTML khách chỉ gọi worker -> worker gọi rent-verify-key
```

Không nên đi theo hướng:

```text
Portal -> copy hmac_secret -> nhét thẳng vào HTML public -> deploy cho khách
```

## 7. Rollout đề xuất

1. Giữ nguyên hệ thống đang chạy.
2. Bổ sung bảng `client_integrations` và `client_request_logs`.
3. Thêm UI quản lý integrations trong portal.
4. Sau đó mới phát hành worker generic dùng chung cho nhiều khách.
5. Cuối cùng mới dừng cách làm từng file HTML riêng.

## 8. Mục tiêu cuối

- Repo sạch hơn
- ít file lẻ hơn
- khóa được từng khách riêng
- log rõ ràng hơn
- giảm nguy cơ lộ secret
- không phải lặp lại thao tác thủ công cho từng web khách
