# FIX NOTE 2026-04-17 V7

## Đã sửa

### 1) Diff / Remap / Migrate và Dumps so.c không mua được
- Gốc bệnh không phải bootstrap rơi, mà runtime unlock gọi `consumeRuntimeFeature()` với `featureCode` là `unlock_migration_tools` hoặc `unlock_dumps_soc`.
- Trong bảng `server_app_features` trước đó thiếu 2 row catalog này, nên runtime nổ `FEATURE_NOT_FOUND`.
- App Android map `FEATURE_NOT_FOUND` sang toast đỏ: `Server đang dùng mã tính phí cũ cho thao tác mở khóa...`
- Đã thêm migration `20260417120000_unlock_feature_catalog_and_runtime_controls_fix.sql` để upsert đủ 2 row unlock catalog còn thiếu.

### 2) Chuỗi migration redeem bị fail khi deploy
- Gốc bệnh là migration `20260417103000_redeem_rpc_ambiguous_fix_v2.sql` thay đổi row type của `server_app_reserve_redeem_use` giữa `redeemed_count` và `next_redeemed_count`.
- PostgreSQL không cho `create or replace function` đổi output row type kiểu đó.
- Đã sửa migration này theo hướng an toàn:
  - `drop function if exists public.server_app_reserve_redeem_use(text, uuid, text, text, text, jsonb);`
  - tạo lại function với output ổn định `redeemed_count`.

### 3) Runtime controls cho Find Dumps
- Migration mới cũng tự self-heal row `server_app_runtime_controls` của `find-dumps` để tab Runtime không hụt row gốc rồi nhảy sang nhánh insert lỗi.

## Việc cần làm
1. Chạy migration mới theo thứ tự.
2. Deploy lại function `server-app-runtime`.
3. Test lại mở khóa `Diff / Remap / Migrate` và `Dumps so.c`.

## Kỳ vọng
- Không còn toast đỏ `Server đang dùng mã tính phí cũ...` ở 2 feature trên.
- Push migrations không còn fail ở migration `20260417103000_redeem_rpc_ambiguous_fix_v2.sql`.
