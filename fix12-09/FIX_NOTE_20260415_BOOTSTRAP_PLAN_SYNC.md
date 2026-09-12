# FIX NOTE 2026-04-15: bootstrap session + đồng bộ gói + stale token heal

## Các lỗi đã chốt

1. **Catalog/heartbeat có thể trả về state nhưng không trả lại `session_token`**
   - Khi app gửi token cũ đã hỏng, server tìm được session tái sử dụng theo `account_ref + device_id` nhưng không thể khôi phục plaintext token từ hash.
   - Kết quả: app vẫn bị `Session: null`, mở khóa/mua hàng báo lỗi phiên cũ, rất khó chịu.

2. **Plan cũ trong DB có thể bị lệch chữ hoa/thường**
   - Ví dụ `PRO`, `Plus`, `Go`.
   - Runtime đọc entitlement/wallet được nhưng khi map với `server_app_plans` lại không khớp key nên bị rơi về `classic`.
   - Kết quả: credit vẫn có nhưng UI gói lại hiện Classic.

3. **App giữ account/session cache cũ khi đổi tài khoản hoặc khi server trả state không kèm token**
   - Dễ gây bám phiên cũ hoặc hiện trạng sai tạm thời.

## Fix đã làm

### Repo / server runtime
- Chuẩn hóa `plan_code` về lowercase khi đọc settings, plans, entitlements, reward packages, redeem keys.
- Nếu client gửi `session_token` cũ mà DB không còn record tương ứng, server sẽ **xóa hướng stale token** và bootstrap lại phiên mới.
- Nếu server chỉ tìm được reusable session theo account/device, server sẽ **rotate session** và phát **session token mới thật** cho app.
- Khi bootstrap lại phiên, server revoke session active cũ cùng device rồi tạo session mới để app có token sống.

### App
- Khi app refresh catalog/heartbeat mà server không trả `session_token`, app sẽ chủ động clear token cũ để không tiếp tục bám phiên hỏng.
- Khi email tài khoản đang link thay đổi, app sẽ reset cache runtime theo account mới, tránh dùng nhầm session/account cũ.
- Đồng bộ account bound ở AppHub và Runtime Center theo email hiện tại.

## Kỳ vọng sau fix
- Xóa app, cài lại, đăng nhập lại cùng tài khoản thì runtime phải tự lấy lại session mới.
- Nếu entitlement còn Pro/Plus/Go hợp lệ thì UI phải lên đúng gói đó, không rơi về Classic chỉ vì lệch case hoặc stale session.
- Bấm làm mới từ server không còn vòng lặp `SESSION_NOT_FOUND` kiểu vô tận.
