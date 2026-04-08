# Phase 12 A-Z fixes (2026-04-06)

## Mục tiêu
Sửa các lỗi thực tế còn lại sau khi quay về nền UI phase 10:
- `Cấu hình app` bị trắng
- `Simulator` báo `Failed to send request to the Edge Function`
- `Restore session` lỗi `duplicate key value violates unique constraint ... (23505)`
- Bổ sung lại SQL anti-abuse/quota của phase 11 vào repo để không bị mất

## Đã sửa
### 1) Config app trắng
- File: `src/pages/AdminServerAppDetail.tsx`
- Sửa: thêm `const [searchParams, setSearchParams] = useSearchParams();`
- Nguyên nhân: code dùng `searchParams` / `setSearchParams` nhưng không khởi tạo.

### 2) Simulator gọi runtime theo đường ổn định hơn
- File: `src/pages/AdminServerAppRuntime.tsx`
- Sửa: đổi simulator từ `supabase.functions.invoke("server-app-runtime")` sang `postFunction("/server-app-runtime", payload)`
- Mục đích: đồng bộ cách gọi Edge Function với lớp helper hiện có, giảm lỗi request/network mù mờ và giữ lỗi trả về dễ đọc hơn.

### 3) Revoke / restore session và entitlement đi qua ops backend
- File: `src/pages/AdminServerAppRuntime.tsx`
- Sửa: bỏ update trực tiếp bảng từ frontend cho các action:
  - `revoke_session`
  - `restore_session`
  - `revoke_entitlement`
  - `restore_entitlement`
- Tất cả chuyển sang gọi `POST /server-app-runtime-ops` với JWT admin.

### 4) Fix restore session bị unique 23505
- File: `supabase/functions/server-app-runtime-ops/index.ts`
- Sửa: trước khi `restore_session`, backend sẽ tự revoke các session `active` khác cùng `(app_code, account_ref, device_id)` rồi mới mở lại session đích.
- Nguyên nhân: bảng `server_app_sessions` có unique index `server_app_sessions_one_active_per_device_idx` nên restore trực tiếp có thể đụng bản active hiện có.

### 5) Đưa lại SQL anti-abuse / quota của phase 11 vào repo
- File mới: `supabase/migrations/20260406150000_server_app_runtime_phase8_antibuse_and_quota.sql`
- File doc: `docs/PHASE11_RUNTIME_ANTI_ABUSE_AND_SUP_OPTIMIZATION.md`
- Ghi chú: lượt này mới đưa lại SQL + doc vào repo để không mất dấu; chưa ép rollout toàn bộ UI phase 11.

## Không đụng
- `free`
- `rent`
- `reset`
- layout phase 11 bị lệch hướng

## Kiểm tra kỹ thuật
- `npm ci`: OK
- `npm run build`: OK

## Việc cần deploy/test live
1. Deploy `server-app-runtime-ops`
2. Nếu simulator live vẫn lỗi, deploy lại cả `server-app-runtime`
3. Test lại:
   - Runtime > Simulator
   - Runtime > Sessions > Restore
   - Runtime > Entitlements > Revoke/Restore
   - Config app
