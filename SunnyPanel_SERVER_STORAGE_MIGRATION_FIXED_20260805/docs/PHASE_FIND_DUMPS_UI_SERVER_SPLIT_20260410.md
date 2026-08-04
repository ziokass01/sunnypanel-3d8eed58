# Phase Find Dumps UI + Server Split Update (2026-04-10)

## Đã chỉnh

- Free Fire ở khu **Server app** chỉ còn đúng 1 nút **Server**.
- Find Dumps mở thẳng vào **Server key** của app-host, không còn nhảy nhầm sang config/runtime.
- **Runtime app** được rút gọn: chỉ giữ control thật (runtime, redeem, consume, maintenance, version block, timeout).
- **Audit Log** được tách ra thành 5 vùng rõ ràng:
  - Ví
  - Session
  - Giao dịch
  - Sự kiện
  - Trace
- **Server key** của Find Dumps được làm lại để quản lý riêng:
  - package key: classic / go / plus / pro
  - credit key: thường / VIP
  - preview cách bung lựa chọn ở `/free`
  - package key không cần user chỉnh ngày/giờ ngoài `/free`, vì thời hạn đã chốt từ server key
- **Charge / Credit Rules** được làm lại để tránh màn trắng và tránh kéo dài ngoằng:
  - cụm gói
  - cụm credit
  - cụm chức năng app kiểu accordion/collapse

## Ghi chú

- Các màn mới ưu tiên **ổn định, dễ đọc, dễ quản lý**.
- Runtime theo dõi dài dòng đã được chuyển sang Audit Log.
- Charge page mới có nút lưu thật qua:
  - `server_app_plans`
  - `server_app_features`
  - `server_app_wallet_rules`
- Server key mới có nút lưu thật qua:
  - `server_app_reward_packages`

## Tác dụng với `/free`

- Khi chọn key Find Dumps ở `/free`, client chỉ bung thêm lựa chọn package hoặc credit.
- Thời lượng package và credit amount / expiry được lấy từ server key, không bắt user nhập lại kiểu Free Fire legacy.
