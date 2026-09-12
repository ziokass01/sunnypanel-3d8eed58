# Phase 10C - Mobile tabs, redirect guard, and app-domain cleanup

## Mục tiêu
- Gọn UI app-domain trên mobile
- Bỏ các nút quay lại trùng lặp trong từng trang
- Chia runtime/config thành tab nhỏ để đỡ dài màn hình
- Chặn các route đi nhầm trên app-domain và tự chuyển về đúng nơi

## Đã sửa
- `src/shell/AppWorkspaceShell.tsx`
  - bỏ nút đăng xuất ở app-domain shell
  - chỉ giữ một nút về admin tổng trong menu điều hướng
  - làm gọn hero của app-domain để không lặp tiêu đề lớn với trang con
  - lưu `lastAppCode` và `lastAppSection` vào localStorage để hỗ trợ tự quay lại app đúng chỗ

- `src/pages/AdminServerAppRuntime.tsx`
  - bỏ nút quay lại cấu hình trong trang runtime
  - chuyển tab runtime sang dạng nhỏ, cuộn ngang trên mobile
  - dùng query `?tab=` để giữ tab đang mở
  - dời ô tìm kiếm vào đúng từng tab thay vì gom 1 cục ở đầu trang
  - đổi câu chữ ngắn gọn hơn cho mobile
  - rút gọn toast lỗi Edge Function để không phá bố cục
  - làm gọn card tổng số và giảm cỡ chữ

- `src/pages/AdminServerAppDetail.tsx`
  - bỏ nút quay lại admin tổng trong trang cấu hình
  - sửa nút mở runtime sang route app-domain đúng, tránh 404
  - chuyển tab cấu hình sang dạng nhỏ, cuộn ngang trên mobile
  - dùng query `?tab=` để giữ tab đang mở
  - làm gọn card tổng quan `classic / quà tặng / plans / features / reward packages`

- `src/App.tsx`
  - thêm redirect guard cho app-domain root / login / route đi nhầm
  - nếu đang có session thì quay về app section gần nhất
  - nếu chưa có session thì chuyển sang admin login

- `src/auth/AuthGate.tsx`
  - khi vào app-domain mà chưa đăng nhập, chuyển sang admin login với `next` là URL hiện tại

- `src/pages/Login.tsx`
  - sau khi đăng nhập xong sẽ quay về `next` nếu có
  - hỗ trợ cả `next` là absolute URL của app-domain

- `src/lib/appWorkspace.ts`
  - thêm helper `getAdminLoginUrl(next)`

## Không đụng
- `free`
- `rent`
- `reset-key`
- Supabase secrets live
- Logic public hiện có

## Build check
- build OK bằng `node node_modules/vite/bin/vite.js build`
- lint OK ở mức không có error mới, chỉ còn warning cũ của repo
