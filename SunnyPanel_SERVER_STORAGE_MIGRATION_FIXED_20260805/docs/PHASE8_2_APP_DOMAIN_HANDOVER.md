# PHASE 8.2 - APP DOMAIN WORKSPACE

Mục tiêu phase này:
- Khi bấm `Cấu hình app` hoặc `Runtime app` từ admin tổng, hệ thống sẽ **chuyển hẳn sang domain mới** `app.mityangho.id.vn`
- Giữ nguyên quyền admin hiện tại
- Không đụng vào logic runtime / redeem / consume / ops
- Chỉ đổi cấu trúc web và điều hướng

## Đã sửa

### 1) Thêm helper app domain
- `src/lib/appWorkspace.ts`

Chứa các hàm:
- `getAdminOrigin()`
- `getAppWorkspaceOrigin()`
- `getAdminAppsUrl()`
- `getAppWorkspaceUrl(appCode, tab)`
- `isAdminConsoleHost(hostname)`
- `isAppWorkspaceHost(hostname)`

Mặc định:
- admin: `https://admin.mityangho.id.vn`
- app workspace: `https://app.mityangho.id.vn`

Có thể override bằng env:
- `VITE_ADMIN_ORIGIN`
- `VITE_APP_WORKSPACE_ORIGIN`
- `VITE_ADMIN_HOSTS`
- `VITE_APP_WORKSPACE_HOSTS`

### 2) App.tsx
- Tách rõ host admin và host app
- Trên `admin.*` vẫn là admin shell cũ
- Trên `app.mityangho.id.vn` sẽ dùng `AppWorkspaceShell`
- Legacy route cũ ở admin:
  - `/admin/apps/:appCode`
  - `/admin/apps/:appCode/runtime`
  sẽ **redirect ra domain app**
- Trên app host có thêm route tương thích:
  - `/admin/apps` -> quay về admin tổng
  - `/admin/apps/:appCode` -> `/apps/:appCode/config`
  - `/admin/apps/:appCode/runtime` -> `/apps/:appCode/runtime`

### 3) AdminServerApps.tsx
- Bỏ kiểu mở workspace nội bộ
- Nút:
  - `Cấu hình app`
  - `Runtime app`
  sẽ chuyển thẳng tới `app.mityangho.id.vn`

### 4) AppWorkspaceShell.tsx
- Thiết kế lại theo ý:
  - 2 tab lớn:
    - `Cấu hình app`
    - `Runtime`
  - bấm tab lớn thì bên dưới mới hiện trang tổng thể tương ứng
- Có nút quay lại admin tổng
- Giao diện tách hẳn khỏi cảm giác "đang ở trong admin tổng"

## Lưu ý deploy
- Phase này chỉ sửa **frontend**
- Không cần migration mới
- Không cần deploy lại Supabase Functions

## Sau khi chép patch
1. Build/deploy frontend admin/app như bình thường
2. Trỏ `app.mityangho.id.vn` vào bản frontend mới
3. Đảm bảo domain app có thể dùng chung auth/admin với Supabase hiện tại
4. Nếu đang khóa domain ở auth redirect hoặc origin, thêm `app.mityangho.id.vn`

## Cần test
1. Từ `admin.mityangho.id.vn/admin/apps`, bấm `Cấu hình app`
   - phải sang `app.mityangho.id.vn/apps/<appCode>/config`
2. Bấm `Runtime app`
   - phải sang `app.mityangho.id.vn/apps/<appCode>/runtime`
3. Trên app domain:
   - tab lớn `Cấu hình app` mở ra phần cấu hình với tab nhỏ
   - tab lớn `Runtime` mở ra phần runtime với tab nhỏ
4. Nút `Quay lại admin tổng`
   - phải về `admin.mityangho.id.vn/admin/apps`
