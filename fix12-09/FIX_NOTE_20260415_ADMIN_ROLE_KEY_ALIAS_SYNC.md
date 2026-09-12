# FIX NOTE 2026-04-15: admin role + legacy key bridge + account alias sync

## Lỗi gốc đã chốt

### 1) Admin panel lâu lâu tự rơi sang `Not authorized`
- Web panel trước đó đọc role quá phụ thuộc vào RPC / metadata tại thời điểm hiện tại.
- Khi session refresh chậm, metadata chưa có lại hoặc RPC role lỗi tạm thời, client hiểu nhầm là tài khoản không có quyền.
- Kết quả: admin thật vẫn bị đá về màn `Not authorized`, phải đăng nhập lại.

### 2) Credit vẫn đúng nhưng gói lại tụt về `Classic`
- Runtime wallet và entitlement không phải lúc nào cũng đang nằm cùng một dạng `account_ref`.
- Có dữ liệu cũ dùng email đầy đủ, có dữ liệu chỉ dùng local-part trước dấu `@`.
- Wallet có thể tìm thấy nên credit vẫn sync / vẫn bị trừ.
- Nhưng entitlement không tìm thấy đúng alias nên state fallback về `Classic`.

### 3) Key lấy từ flow cũ không redeem được trong Runtime
- Một số key Find Dumps cũ được phát qua nhánh `licenses` / `licenses_free_*` thay vì `server_app_redeem_keys`.
- App Runtime chỉ redeem trực tiếp ở `server_app_redeem_keys` nên key hợp lệ vẫn báo chưa đồng bộ / sai app.
- Ngoài ra `free-admin-test` có case `app_code` trống nên phát nhầm qua flow cũ.

## Fix đã làm

### A. Web panel role fallback
- File: `src/hooks/use-panel-role.ts`
- Thêm cache `panel_role:${user.id}` ở localStorage.
- Ưu tiên xác định role theo thứ tự:
  1. RPC `get_my_panel_role`
  2. `app_metadata.panel_role` / `app_metadata.role`
  3. cached role cũ
- Mục tiêu: admin không còn bị rớt quyền giả khi refresh session chập chờn.

### B. Runtime đồng bộ theo nhiều alias account_ref
- File: `supabase/functions/_shared/server_app_runtime.ts`
- Thêm helper `getAccountRefAliases()` để thử:
  - email đầy đủ dạng lowercase
  - local-part trước `@`
- Áp dụng alias lookup cho:
  - reusable session
  - active entitlement
  - wallet record
  - feature unlock state
  - existing feature unlock record
  - revoke active sessions
  - count active devices
- Mục tiêu: nếu dữ liệu legacy bị lệch `account_ref`, runtime vẫn gom đúng session + entitlement + wallet.

### C. Bridge key legacy sang runtime redeem key
- File: `supabase/functions/_shared/server_app_runtime.ts`
- Thêm nhánh bridge:
  - Khi `redeem_key` chưa có trong `server_app_redeem_keys`, runtime sẽ thử dò key ở flow legacy `licenses` + `licenses_free_issues` + `licenses_free_sessions` + `licenses_free_key_types`.
  - Nếu xác định đây là key Find Dumps hợp lệ, server sẽ tự tạo bản ghi tương ứng trong `server_app_redeem_keys` rồi redeem tiếp.
- Mục tiêu: key cũ vẫn nhận được, không bắt buộc phải phát lại toàn bộ key cũ.

### D. `free-admin-test` tự suy ra app_code Find Dumps
- File: `supabase/functions/free-admin-test/index.ts`
- Nếu `app_code` trên `licenses_free_key_types` bị trống nhưng có dấu hiệu Find Dumps như:
  - `default_package_code`
  - `default_credit_code`
  - `key_signature = FD`
  - `code` bắt đầu bằng `fd`
- Server sẽ coi đúng là `find-dumps` và phát key theo flow runtime redeem.

## Cần deploy lại
- `server-app-runtime`
- `free-admin-test`
- web panel frontend

## Ghi chú thật
- Bản vá này xử lý đúng nhóm lỗi logic và alias dữ liệu cũ.
- Nếu sau khi deploy mà một tài khoản cụ thể vẫn hiện `Classic`, cần kiểm tra trực tiếp record entitlement trong DB của tài khoản đó vì có thể dữ liệu thật đã bị ghi sai / thiếu row active.
