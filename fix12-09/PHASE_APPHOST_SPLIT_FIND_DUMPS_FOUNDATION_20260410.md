# Phase app-host split + Find Dumps foundation

## Đã làm

- Giữ Free Fire là nhánh legacy. Trong khu Server app, Free Fire chỉ còn nút **Server** mở thẳng trang admin key cũ.
- Tách Find Dumps sang app-host mới với 6 tab:
  - Cấu hình app
  - Runtime app
  - Server key
  - Charge / Credit Rules
  - Audit Log
  - Trash
- Bổ sung `serverAppPolicies.ts` làm nền cho:
  - package discount theo %
  - daily credit / VIP credit
  - decimal credit
  - expiry từ lúc nhận key
  - one-time use
  - feature pricing foundation
- Thêm trang `AdminServerAppKeysPage` cho Find Dumps.
- Thêm trang `AdminServerAppAuditPage` cho Find Dumps.
- Mở rộng điều hướng app-host và route để hỗ trợ `keys` + `audit`.

## Chủ đích

- Không phá cấu trúc Free Fire hiện tại.
- Dựng nền rõ ràng cho Find Dumps để sau này nối backend/runtime/feature gate thật.
- Giữ UI cùng tinh thần với admin hiện tại nhưng không copy nguyên xi sang app-host.

## Phần cố ý giữ ở mức foundation

- Chưa nối backend thật cho Server key / Audit Log.
- Chưa thay đổi sâu flow `/free get/gate/claim/reveal` ở frontend public.
- Chưa áp cơ chế block build identity ở backend. Mới dựng nền app-host để chốt cấu trúc trước.
