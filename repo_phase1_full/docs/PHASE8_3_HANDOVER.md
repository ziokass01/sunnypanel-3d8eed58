# PHASE 8.3 HANDOVER

Mục tiêu:
- Tách app workspace sang hẳn domain `app.mityangho.id.vn`
- Không còn render workspace dưới `admin.mityangho.id.vn`
- Domain app có 2 tab lớn:
  - Cấu hình app
  - Runtime
- Giữ nguyên logic auth/admin/runtime hiện có

Các file sửa:
- src/lib/appWorkspace.ts
- src/App.tsx
- src/pages/AdminServerApps.tsx
- src/shell/AppWorkspaceShell.tsx

Lưu ý deploy:
- Frontend cần có host `app.mityangho.id.vn`
- Có thể set:
  - VITE_APP_WORKSPACE_ORIGIN=https://app.mityangho.id.vn
  - VITE_APP_HOSTS=app.mityangho.id.vn

Kiểm tra:
1. Từ admin bấm Cấu hình app -> sang domain app
2. Từ admin bấm Runtime app -> sang domain app
3. Truy cập nhầm `admin.mityangho.id.vn/apps/...` -> tự redirect sang app domain
4. Trên app domain chỉ còn 2 tab lớn
