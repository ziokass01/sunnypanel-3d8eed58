# Phase 12 Final Build - Trash + Hard Delete + Full Build

## Sửa gì
- Thêm tab `Trash` vào app-domain shell, cạnh `Runtime app` và `Cấu hình app`.
- Thêm route `/apps/:appCode/trash`.
- Thêm trang `AdminServerAppTrashPage` để xem các session / entitlement không còn active và xóa vĩnh viễn.
- Thêm xác nhận trước khi xóa vĩnh viễn.
- Thêm action mới cho `server-app-runtime-ops`:
  - `hard_delete_session`
  - `hard_delete_entitlement`
- Chặn xóa vĩnh viễn với session / entitlement còn active.
- Giữ ghi chú ở tab Session rằng dữ liệu không còn active sẽ dọn ở Trash.

## Đã build
- Chạy `npm ci`
- Chạy `npm run build` thành công

## Không đụng
- `free`
- `rent`
- `reset`
- các trang workspace trung gian đã bỏ trước đó

## Cần deploy
1. Frontend app-domain
2. `server-app-runtime-ops` với bản mới

## Lưu ý
- `RUNTIME_OPS_ADMIN_KEY` đã lộ trong quá trình debug trước đó, nên cần rotate lại sau khi test xong.
