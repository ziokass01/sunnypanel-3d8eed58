# Reset Key Smoke Test

## Đợt 1
- Check 1 key free ở /reset-key
- Check 1 key paid ở /reset-key
- Reset key free lần 1: trừ đúng free_first_penalty_pct
- Reset key paid lần 1 / lần 2: đúng paid_first / paid_next
- Admin: Reset devices -20% lần 1 không trừ, lần 2 trừ 20%
- User role: chỉ vào Dashboard, Licenses, Licenses 2

## Đợt 2
- Admin vào /settings/reset-key
- Đổi 1 giá trị penalty rồi lưu
- Refresh lại còn giữ
- Recent Reset Activity hiện được log reset

## Đợt 3
- Admin vào /settings/reset-logs
- Lọc theo PUBLIC_RESET
- Tìm theo key cụ thể
- Kiểm tra summary cards cập nhật đúng
