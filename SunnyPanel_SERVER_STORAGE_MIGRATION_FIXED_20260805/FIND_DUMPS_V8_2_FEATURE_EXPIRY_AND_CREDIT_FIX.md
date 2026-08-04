# Find Dumps V8.2 hotfix - feature expiry save + credit wallet choice

Phạm vi: chỉ Find Dumps/runtime panel. Không đụng Fake Lag APK.

## Fix 1: web admin gia hạn feature không lưu

Trang `AdminServerAppControl` trước đây chỉ `insert` khi feature chưa có active unlock và `revoke` khi tắt. Nếu feature đã bật sẵn, admin chỉnh ngày hết hạn rồi bấm lưu thì code không update dòng active, nên sau khi refetch ngày lại quay về như cũ.

Đã sửa: khi feature đang bật và đã có active unlock, server panel update lại `expires_at`, `device_id`, `status`, `revoked_at`, `trace_id`, `metadata`, `updated_at` cho chính dòng active.

## Fix 2: Dumps so.c báo thiếu credit dù ví còn đủ

Logic cũ ở runtime server coi `soft_cost` và `premium_cost` là chi phí mixed, tức có thể trừ cả ví thường và ví VIP. Nhưng UI/runtime đang dùng hai giá này như hai lựa chọn thay thế: `Thường X` hoặc `VIP Y`.

Đã sửa ở runtime server:
- Nếu app gửi ví `soft/normal` thì chỉ kiểm và trừ ví thường.
- Nếu app gửi ví `premium/vip` thì chỉ kiểm và trừ ví VIP.
- Nếu app gửi `auto` thì server tự chọn ví đủ tiền theo `consume_priority`, ưu tiên ví thường nếu không cấu hình premium-first.
- Nếu cả hai ví đều không đủ mới báo thiếu.

App V8 cũng được chỉnh nhẹ để khi cả hai giá đều có, app gửi ví phù hợp với số dư local thay vì để mixed mơ hồ.
