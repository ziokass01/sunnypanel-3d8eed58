# Phase fix: server key / audit routing / free-fire redirect / find-dumps free-choice

## Đã sửa

1. `src/lib/appWorkspace.ts`
- thêm hỗ trợ section `keys` và `audit`
- fix `buildWorkspacePath()` và `buildAppWorkspaceUrl()` để không còn fallback nhầm về `runtime`

2. `src/lib/serverAppPolicies.ts`
- `free-fire.serverUrl` giờ trỏ thẳng sang `https://admin.mityangho.id.vn/admin/free-keys?app=free-fire`
- tránh lỗi bấm Server ở Free Fire nhưng vẫn ở host app dẫn tới `404`

3. `src/shell/AppWorkspaceShell.tsx`
- nút quay lại danh sách app trên app-host giờ quay về danh sách app ở admin
- giữ cảm giác quản trị liền mạch hơn

4. `src/pages/AdminServerAppRuntime.tsx`
- sửa file runtime bị vỡ regex/string/newline
- bỏ card bị lặp
- build ổn trở lại

5. `src/pages/AdminServerAppCharge.tsx`
- sửa logic `??` đi cùng `||`
- hết lỗi build và hết nguy cơ màn trắng do transform fail

6. `src/pages/AdminFreeKeys.tsx`
- khi chọn app `find-dumps`, form tạo loại key đổi sang nhánh riêng:
  - chọn `Gói Find Dumps` hoặc `Credit Find Dumps`
  - bung thêm lựa chọn gói/credit tương ứng
  - ẩn phần chỉnh ngày/giờ vì thời gian thật đã chốt ở server key của Find Dumps
- khi chọn app khác như `free-fire`, form cũ vẫn giữ nguyên kiểu giờ/ngày

7. `src/pages/FreeLanding.tsx`
- nếu key type Find Dumps là `package` thì ở `/free` chỉ bung lựa chọn gói
- nếu key type Find Dumps là `credit` thì ở `/free` chỉ bung lựa chọn credit
- nếu key type cũ/mixed thì vẫn cho chọn giữa package và credit
- không bắt user nhập ngày/giờ ở `/free` nữa với nhánh key đã chốt từ server

## Kiểm tra build
- `npm run build` đã qua thành công trên repo sửa này.

## Ghi chú đồng bộ app
- app Android đang trỏ runtime mặc định tới `https://mityangho.id.vn/api/server-app-runtime`
- app auth base đang là `https://app.mityangho.id.vn`
- như vậy nhánh runtime/auth chính đang đồng bộ với repo web hiện tại.
- trong `AuthApiClient.java` vẫn còn nhánh fallback legacy suy từ runtime sang `/functions/v1/mobile-auth-email`; chưa chạm ở repo web lần này vì đây là phía app Android.
