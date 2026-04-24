Find Dumps final patch 2026-04-15

Nội dung chính:
- rebalance plan daily credit + cap + discount soft/VIP
- chuẩn hóa feature cost và min plan
- thêm/mở lại unlock_migration_tools để app không còn chờ server
- tách giá 1/7/30 ngày thật cho unlock rules
- seed lại reward packages + licenses_free_key_types để hết lỗi label null khi lưu Server key
- tăng độ ổn định cache role admin ở web panel

Cần deploy/chạy:
1. chạy migration 20260415121500_find_dumps_final_pricing_and_server_key_fixes.sql
2. deploy web panel frontend
3. deploy server-app-runtime nếu cần đồng bộ runtime state mới
4. deploy free-config / free-reveal nếu muốn free flow ăn ngay cấu hình mới
