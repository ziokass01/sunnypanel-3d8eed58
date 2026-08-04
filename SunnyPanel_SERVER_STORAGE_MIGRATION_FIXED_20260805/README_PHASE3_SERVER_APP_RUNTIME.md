# Phase 3 - Server app runtime groundwork

## English
This phase continues from the stable admin panel build and adds the next internal layer for app-specific runtime management.

Completed in this package:
- Added `/admin/apps/:appCode`
- Added `AdminServerAppDetail.tsx`
- Upgraded `Server app` list page so each app can:
  - open external server web
  - open internal configuration page
- Added phase 2 migration:
  - `20260404193000_server_apps_phase2.sql`
- Added phase 3 migration:
  - `20260404213000_server_app_wallets_rewards_phase3.sql`
- Added app detail tabs:
  - App settings
  - Plans & credit
  - Feature flags
  - Wallet rules
  - Reward / redeem

Design goal:
- keep free/rent logic stable
- move premium app logic into isolated app-specific management
- prepare backend structure for later redeem-key / entitlement / app runtime flows

What is included conceptually:
- guest/default plan per app
- remember key after valid input until admin revokes it
- daily reset hour
- soft credit and premium credit rules
- decimal credit support
- per-feature soft/premium cost
- reward packages that can later be mapped to redeem keys

Still for later:
- real redeem key issuance/claim endpoints
- real entitlement rows per user/device
- app-side runtime consume APIs
- history/logs for gift key redemption

## Tiếng Việt
Phase này nối tiếp từ bản admin panel đang ổn và thêm lớp nội bộ tiếp theo cho từng app riêng.

Đã làm trong gói này:
- Thêm route `/admin/apps/:appCode`
- Thêm `AdminServerAppDetail.tsx`
- Nâng trang `Server app` để mỗi app có thể:
  - mở server web ngoài
  - mở trang cấu hình nội bộ
- Thêm migration phase 2:
  - `20260404193000_server_apps_phase2.sql`
- Thêm migration phase 3:
  - `20260404213000_server_app_wallets_rewards_phase3.sql`
- Thêm các tab trong màn chi tiết app:
  - App settings
  - Plans & credit
  - Feature flags
  - Wallet rules
  - Reward / redeem

Mục tiêu thiết kế:
- giữ ổn định free/rent hiện tại
- tách logic app premium sang khu quản lý riêng theo từng app
- chuẩn bị cấu trúc backend cho redeem key / entitlement / runtime app về sau

Những gì đã có về mặt ý tưởng:
- guest/default plan theo từng app
- key nhập đúng rồi thì nhớ tới khi admin revoke
- giờ reset mỗi ngày
- quy tắc credit thường và credit kim cương
- hỗ trợ credit số thập phân
- cost mềm/cứng cho từng feature
- reward package để sau này map với key nhập ở tab Quà tặng

Phần để làm tiếp sau:
- endpoint thật để phát/nhận redeem key
- entitlement thật theo user/device
- API runtime cho app trừ credit
- lịch sử/log nhận mã quà
