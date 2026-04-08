# SERVER PHASE 9 - CREDIT DEBT + FEATURE MANIFEST + QUANTITY CONSUME

Ngày: 2026-04-08

## Mục tiêu đã thêm
- Cho admin chỉnh manifest feature chi tiết hơn.
- Tách `export_plain` và `export_json` thành 2 feature khác nhau.
- Thêm feature server cho `convert_image`, `encode_decode`, `hex_edit`.
- Hỗ trợ `charge_unit` để app có thể cộng dồn local rồi mới sync lên server.
- Hỗ trợ `quantity` trong action `consume` để 1 request có thể trừ nhiều đơn vị cùng lúc.
- Cho phép ví âm theo rule app, và reset kiểu `debt_floor`.

## Cột mới ở `server_app_features`
- `category`
- `group_key`
- `icon_key`
- `badge_label`
- `visible_to_guest`
- `charge_unit`
- `charge_on_success_only`
- `client_accumulate_units`

## Cột mới ở `server_app_wallet_rules`
- `soft_daily_reset_mode`
- `premium_daily_reset_mode`
- `soft_floor_credit`
- `premium_floor_credit`
- `soft_allow_negative`
- `premium_allow_negative`

## Đổi logic runtime
- `catalog/me` giờ trả thêm manifest feature mới.
- `consume` nhận thêm `quantity`.
- Nếu rule ví cho phép âm thì `consume` không chặn chỉ vì thiếu số dư.
- `ensureWalletFresh()` đã có mode `debt_floor`:
  - nếu số dư > floor: giữ nguyên
  - nếu số dư từ 0 đến dưới floor: kéo lên floor
  - nếu số dư âm: reset rồi trừ nợ trước

## Giá trị seed mặc định cho `find-dumps`
- `batch_search`: `charge_unit = 5`, `client_accumulate_units = true`
- `export_plain`: feature riêng
- `export_json`: feature riêng
- `convert_image`, `encode_decode`, `hex_edit`: thêm vào catalog
- `consume_priority = soft_first`
- `soft/premium reset mode = debt_floor`
- `soft/premium floor = 5`

## Các file sửa
- `supabase/migrations/20260408103000_server_app_runtime_phase9_credit_debt_and_feature_manifest.sql`
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/functions/server-app-runtime/index.ts`
- `src/pages/AdminServerAppDetail.tsx`

## Lưu ý triển khai
1. Chạy migration phase 9.
2. Deploy lại function `server-app-runtime`.
3. Build lại web admin để thấy field mới.
4. App phía client có thể dùng ngay `quantity` và `charge_unit`.

## Lưu ý chống lỗi cũ
- Không sửa đè migration cũ.
- Không bỏ check `feature_code` / `session_token` ở runtime.
- Cơ chế `quantity` chỉ cộng dồn server-side, app vẫn nên giữ local bucket để tiết kiệm request.
