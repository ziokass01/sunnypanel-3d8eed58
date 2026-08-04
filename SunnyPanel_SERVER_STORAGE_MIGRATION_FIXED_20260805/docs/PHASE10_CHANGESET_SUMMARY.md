# PHASE 10 CHANGESET SUMMARY

## Files changed
- `.env.example`
- `docs/PHASE9_AUTH_CORS_FIX.md`
- `docs/PHASE10_APP_DOMAIN_SAFE_SPLIT.md`
- `src/App.tsx`
- `src/lib/appWorkspace.ts`
- `src/pages/AdminServerApps.tsx`
- `src/pages/AdminServerAppRuntime.tsx`
- `src/shell/AppWorkspaceShell.tsx`

## What changed
1. App-domain routing now defaults to `runtime` instead of a neutral workspace stop.
2. The main Server app list no longer shows a redundant `Mở app workspace` button.
3. App-domain shell was rebuilt into a rent-inspired layout with only two main lanes:
   - `Runtime app`
   - `Cấu hình app`
4. Return navigation now points back to the admin app list through a dedicated helper.
5. Env/docs now separate public root and app-domain concerns:
   - `PUBLIC_BASE_URL` can stay on the public root
   - frontend can use `VITE_APP_BASE_URL` for `app.mityangho.id.vn`

## Validation done locally
- `npm run build` ✅
- `npm run lint` ✅ with existing warnings only, no new blocking lint errors from this change set

## Important non-code follow-up
Production still needs live verification for:
- `RUNTIME_OPS_ADMIN_KEY`
- `ALLOWED_ORIGINS` including `https://app.mityangho.id.vn`
- `server-app-runtime-ops` returning 200 for `account_snapshot` and `redeem_preview`


## Bổ sung nhanh 2026-04-06
- Thêm migration `20260406093000_server_app_wallet_consume_priority.sql` để tách policy trừ credit theo app.
- Find Dumps mặc định dùng `consume_priority = soft_first`, nghĩa là credit thường được trừ trước, thiếu mới chạm sang premium khi app gửi `wallet_kind=auto`.
- Trang `Cấu hình app -> Wallet rules` có thêm dropdown chỉnh thứ tự auto consume để sau này đổi app khác không phải sửa code cứng.
- Runtime simulator hiển thị rõ policy auto hiện tại để khỏi nhầm giữa `auto`, `soft`, `premium`.
