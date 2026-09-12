# Phase app-host: decimal credit + package discount + daily reset + Find Dumps free-flow split

## Đã làm
- Giữ Free Fire đi nhánh legacy, không đổi đường free-flow cũ.
- Tăng `serverAppPolicies` thành policy engine có tính giá theo phần trăm giảm, giữ số thập phân thật và preview reset hằng ngày.
- Tách bundle free-flow theo `app_code` để Find Dumps và Free Fire không dẫm token/session lên nhau.
- `free-config` hỗ trợ gửi `x-app-code` để backend có thể trả config theo app.
- `FreeLanding`, `FreeGate`, `FreeClaim` gửi thêm `app_code`, `package_code`, `credit_code`, `wallet_kind` cho Find Dumps.
- `AdminServerAppCharge` có preview giá thật theo gói và reset hằng ngày cho Find Dumps.

## Điều còn chờ backend
- Edge functions `/free-start`, `/free-gate`, `/free-reveal`, `/free-resolve` cần đọc các field mới để tách nhánh Find Dumps.
- Runtime consume phía server cần dùng cùng công thức discount/reset như policy preview ở client.
- Block version theo build identity vẫn cần bước backend/runtime riêng.
