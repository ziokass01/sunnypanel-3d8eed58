# Fix note 2026-04-17: panel save RLS hotfix v6

Đã xử lý lỗi lưu ở các màn:
- Runtime app (`server_app_runtime_controls`)
- Charge / Credit Rules (`server_app_plans` và các bảng liên quan)
- Server key (`server_app_reward_packages`)

## Gốc lỗi
Các policy RLS cũ chỉ cho role `admin` ghi dữ liệu. Trong thực tế panel đang có tài khoản `moderator` cũng cần thao tác quản trị app-host. Khi `upsert` rơi vào nhánh insert/update, Supabase chặn với lỗi `new row violates row-level security policy`.

## Bản vá
- thêm hàm `public.is_server_app_panel_manager(uuid)`
  - trả về true cho `admin` hoặc `moderator`
- thay policy RLS của các bảng server-app admin để dùng hàm này
- tự chèn row còn thiếu vào `server_app_runtime_controls` để tab Runtime không bị hụt dòng gốc

## Migration mới
- `supabase/migrations/20260417112000_server_app_panel_manager_rls_fix.sql`

## Bảng đã mở đúng quyền panel manager
- `server_apps`
- `server_app_settings`
- `server_app_plans`
- `server_app_features`
- `server_app_wallet_rules`
- `server_app_reward_packages`
- `server_app_redeem_keys`
- `server_app_entitlements`
- `server_app_wallet_balances`
- `server_app_wallet_transactions`
- `server_app_sessions`
- `server_app_runtime_controls`
- `server_app_runtime_events`
- `server_app_feature_unlock_rules`
- `server_app_feature_unlocks`
- `server_app_admin_audit_logs`
- `server_app_runtime_counter_buckets`
- `server_app_runtime_account_devices`
- `server_app_runtime_device_accounts`
- `server_app_runtime_account_bindings`

## Việc cần làm sau khi lấy repo
1. chạy migration mới
2. đăng nhập lại panel nếu phiên hiện tại đang cũ
3. thử lưu lại 3 màn đã lỗi trước đó

## Ghi chú
Bản này chủ yếu sửa quyền RLS và self-heal row runtime. Không động vào `node_modules`, không kèm `dist`.
