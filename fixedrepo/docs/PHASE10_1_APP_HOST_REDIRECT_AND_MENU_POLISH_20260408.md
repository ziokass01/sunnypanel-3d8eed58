# PHASE 10.1 - App-host redirect + menu polish

Ngày: 2026-04-08

## Mục tiêu
- Khi mở workspace app từ danh sách server app trên admin-host thì phải nhảy sang `app.mityangho.id.vn`, không ở lại `admin.mityangho.id.vn`.
- Giữ an toàn, tránh quay lại lỗi loop admin/app.
- Làm drawer/menu workspace mềm hơn, bớt thô, đồng bộ hơn với UI mới.

## Đã sửa

### 1. `src/pages/AdminServerApps.tsx`
- Nút mở `Runtime / Config / Charge / Trash` giờ dùng `buildAppWorkspaceUrl(...)`.
- Nghĩa là bấm từ trang danh sách app trên admin-host sẽ mở sang app-host ngay.
- Thêm luôn nút `Charge` ở grid để mở đúng tab mới.
- Copy trên đầu trang đổi thành hướng dẫn rõ: từ admin-host chỉ chọn app, còn chỉnh workspace thì sang app-host.

### 2. `src/shell/AppWorkspaceShell.tsx`
- Thêm effect kiểm tra nếu người dùng đang ở `admin-host` nhưng lại vào workspace app (`runtime/config/charge/trash`) thì tự `replace(...)` sang URL cùng app/cùng tab ở app-host.
- Cách này tránh mở nhầm khu workspace trên admin domain.
- Điều hướng dùng `replace` để đỡ để lại history xấu.

### 3. Polished UI menu
- Mobile card đầu trang đổi sang nền sáng hơn.
- Drawer bên trái đổi từ dark block nặng sang panel sáng, viền nhẹ, shadow vừa phải.
- Card mô tả app và nút nav nhìn nhẹ hơn, bớt kiểu “thô”.
- Sidebar desktop cũng kéo về cùng style sáng để đồng bộ.

## Đã build
- `npm ci` OK
- `npm run build` OK

## Lưu ý
- Không thêm migration mới.
- Không đổi schema phase 9.
- Đây là lượt chỉ sửa route/UI để workspace server app chạy đúng app-host.
