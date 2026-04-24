Các chỉnh cuối của lượt này:

1. Fix save Server key của Find Dumps
- Upsert licenses_free_key_types giờ gửi đủ cột bắt buộc như label/duration/kind/value/app_label/key_signature
- Hết lỗi null label khi bấm Lưu Server key

2. Đồng bộ free-flow thật theo Server key
- free-config giờ trả thêm map reward package của Find Dumps
- FreeLanding ưu tiên đọc reward server thay vì chỉ bám constants local
- Chọn package/credit ở Server key sẽ ăn khớp hơn với /free

3. Chống rớt quyền admin giả
- usePanelRole giữ sticky cached role cho user hiện tại
- RPC dao động tạm thời sẽ không làm panel tự rơi Not authorized ngay

4. Fix giá mở khóa 1/7/30 và rule thiếu ở app
- Runtime state giờ append synthetic unlock features cho các rule không có feature trực tiếp
- App sẽ nhận được unlock_migration_tools / unlock_dumps_soc / ... đầy đủ hơn
- Giá 1 ngày, 7 ngày, 30 ngày được tách khác nhau theo DB rule

5. Rebalance gói và credit
- Classic: 5 soft/day, cap 5
- Go: 8 soft/day, cap 40, discount nhẹ
- Plus: 25 soft + 0.5 VIP/day, cap 250/6
- Pro: 60 soft + 1 VIP/day, cap 900/18
- VIP hiếm hơn, số dư nhìn gọn hơn, chống lạm phát mạnh

6. Rebalance giá mở khóa
- Binary / Batch / Export / Migration / Dumps so.c có tier 1d/7d/30d tách riêng rõ ràng hơn

Sau khi push repo cần:
- chạy migration mới 20260415113000_find_dumps_discount_sync_server_key_and_unlock_prices.sql
- deploy free-config
- deploy server-app-runtime
- build/deploy web panel
