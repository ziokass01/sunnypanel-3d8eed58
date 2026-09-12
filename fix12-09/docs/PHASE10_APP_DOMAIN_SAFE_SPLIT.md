# PHASE 10 - APP DOMAIN SAFE SPLIT

Mục tiêu lượt này:
- Giữ `PUBLIC_BASE_URL` cho miền public gốc nếu site đang phục vụ `/free`, `/rent`, `/reset-key`
- Dùng app domain riêng `app.mityangho.id.vn` chỉ cho server-app workspace
- Bỏ nút trung gian kiểu `Mở workspace`, chỉ giữ `Cấu hình app` và `Runtime app`
- Không đụng logic `free`, `rent`, `reset-key`

## Những gì đã chỉnh ở frontend

### 1) Domain helper
- `src/lib/appWorkspace.ts`
- Thêm helper rõ vai trò cho:
  - `getPublicSiteOrigin()`
  - `getAdminOrigin()`
  - `getAdminAppsUrl()`
  - `getAppWorkspaceOrigin()`
- `buildAppWorkspaceUrl()` giờ mặc định mở vào `runtime` thay vì dựng thêm trang tổng trung gian.
- Ưu tiên env `VITE_APP_BASE_URL`, fallback sang `VITE_APP_WORKSPACE_ORIGIN` để không phá bản cũ.

### 2) App router
- `src/App.tsx`
- Legacy route `/admin/apps/:appCode` trên admin host sẽ redirect sang app domain và mặc định vào `runtime`.
- Trên app host, `/apps/:appCode` cũng mặc định nhảy vào `runtime`.
- `dashboard` cũ được gấp lại về `runtime` để không duy trì một trạm trung chuyển vô dụng.

### 3) Danh sách Server app
- `src/pages/AdminServerApps.tsx`
- Xóa nút `Mở app workspace` khỏi UI chính.
- Giữ đúng 3 nút:
  - `Cấu hình app`
  - `Runtime app`
  - `Mở server web cũ`
- Hiển thị rõ app domain đang dùng để người vận hành đỡ nhầm.

### 4) Shell của app domain
- `src/shell/AppWorkspaceShell.tsx`
- Làm lại theo nhịp điệu gần với trang thuê:
  - hero tối màu
  - drawer mobile rõ ràng
  - 2 cửa chính `Runtime app` và `Cấu hình app`
  - nút quay lại admin tổng
- Không còn dùng wording nhấn vào `workspace` như một tính năng chính.

## Checklist test sau khi build
1. `admin.mityangho.id.vn/admin/apps` vẫn vào được.
2. Bấm `Cấu hình app` -> sang `app.mityangho.id.vn/apps/<appCode>/config`.
3. Bấm `Runtime app` -> sang `app.mityangho.id.vn/apps/<appCode>/runtime`.
4. Mở trực tiếp `app.mityangho.id.vn/apps/<appCode>` -> tự nhảy vào `runtime`.
5. `mityangho.id.vn/free`, `mityangho.id.vn/rent`, `mityangho.id.vn/reset-key` không bị ảnh hưởng.
6. Runtime web không còn phụ thuộc việc đổi `PUBLIC_BASE_URL` sang app domain.

## Ghi chú về secrets
- Không cần đổi `PUBLIC_BASE_URL` sang `app.mityangho.id.vn` nếu miền gốc đang phục vụ public pages.
- Để app domain gọi functions an toàn, chỉ cần bảo đảm:
  - `ALLOWED_ORIGINS` có `https://app.mityangho.id.vn`
  - patch auth/cors phase 9 đã deploy live
  - `RUNTIME_OPS_ADMIN_KEY` đang đúng ở production
