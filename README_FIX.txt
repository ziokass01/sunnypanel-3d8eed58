Bản vá này sửa 2 lỗi:

1) /free bị trắng
- Nguyên nhân: file src/pages/FreeLanding.tsx có gọi readBundle(...) trong JSX nhưng import lại chỉ có clearBundle, writeBundle.
- Kết quả: khi render đoạn hiển thị Trace của key gần nhất, trang có thể crash trắng.
- Cách sửa: thêm readBundle vào import từ "@/lib/freeFlow".

2) /rent phần admin popup Edit bị mất thao tác
- Nguyên nhân: route hiện dùng bản gọn src/pages/RentAdminCustomerSetup.tsx nên popup Edit chỉ còn setup khách.
- Kết quả: mất các nhóm thao tác quan trọng như tạo activation key, xóa key, tạo reset code, reset pass, rotate HMAC secret, xóa mật khẩu xem HMAC.
- Cách sửa: ghép lại đầy đủ các nhóm thao tác đó vào chính popup Edit của RentAdminCustomerSetupPage, đồng thời vẫn giữ RentClientIntegrationSection để không mất luồng setup khách.

File cần thay:
- src/pages/FreeLanding.tsx
- src/pages/RentAdminCustomerSetup.tsx
