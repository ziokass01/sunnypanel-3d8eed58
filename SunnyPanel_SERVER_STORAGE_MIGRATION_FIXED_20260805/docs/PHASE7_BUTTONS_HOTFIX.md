# Phase 7 Hotfix: simulator / ops feedback

## Mục tiêu
- Không để nút bấm mà giao diện im lặng.
- Hiện rõ payload đã gửi, trạng thái đang chạy, và JSON lỗi/thành công ngay trong trang.
- Thêm action `health` để kiểm tra function sống hay chết trước khi test `catalog`, `redeem`, `consume`.
- Đổi `server-app-runtime-ops/config.toml` sang `verify_jwt = false` để lỗi auth nếu có sẽ rơi về JSON của function thay vì im lặng ở gateway. Việc chặn admin vẫn do `assertAdmin(req)` xử lý ở bên trong function.

## Tệp đã sửa
- `src/pages/AdminServerAppRuntime.tsx`
- `supabase/functions/server-app-runtime/index.ts`
- `supabase/functions/server-app-runtime-ops/config.toml`
- `docs/PHASE7_BUTTONS_HOTFIX.md`
