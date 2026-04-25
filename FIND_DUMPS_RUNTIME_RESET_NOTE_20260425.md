# Find Dumps runtime pricing + reset penalty note 2026-04-25

Phạm vi sửa: chỉ cấu hình/runtime/panel cho `find-dumps` và reset key dùng chung. Không sửa APK/source Fake Lag.

## Giá mở khóa Find Dumps

Server lưu **giá gốc**. App nhận **giá sau giảm theo gói**:

- Classic: 100% giá gốc
- Go: thường 90%, VIP 100%
- Plus: thường 65%, VIP 80%
- Pro: thường 45%, VIP 70%, và một số unlock được free theo rule

Ví dụ `Dumps so.c` giá gốc server là thường `2`, VIP `0.1`. Nếu tài khoản đang ở gói Go thì app thấy thường `1.8` vì Go giảm 10% credit thường. Đây là đúng logic, không phải lệch server. Bản này đã thêm label giải thích rõ giá gốc và giá sau giảm để tránh hiểu nhầm.

## Reset key public/admin

Reset thiết bị giờ phải đi qua policy bù trừ:

- Key phát free qua public/free get-key: `key_kind = free`
- Key tạo từ admin/paid: `key_kind = admin`
- App code được nhận theo prefix key: `FAKELAG-*` => `fake-lag`, `FND-*`/`FD-*` => `find-dumps`, `SUNNY-*` => `free-fire`

Khi reset, hệ thống xóa thiết bị và trừ `%` thời gian còn lại theo `license_reset_settings`. Log ghi vào `audit_logs` với action `PUBLIC_RESET` hoặc `RESET_DEVICES_PENALTY`.

## Deploy

```bash
npx supabase link --project-ref ijvhlhdrncxtxosmnbtt
npx supabase db push
npx supabase functions deploy reset-key --no-verify-jwt
npx supabase functions deploy server-app-runtime --no-verify-jwt
```

Sau khi deploy panel web, vào trang reset/admin reset kiểm tra một key free và một key admin để xác nhận penalty khác nhau đúng như setting.
