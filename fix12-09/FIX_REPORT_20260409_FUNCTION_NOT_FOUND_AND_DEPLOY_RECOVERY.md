# Fix report 2026-04-09: function not found + deploy recovery

- Vá `src/lib/functions.ts` để tự fallback từ gateway public sang `VITE_SUPABASE_URL/functions/v1` khi gặp lỗi kiểu `Requested function was not found`, 404, 502, 503 hoặc fetch fail ở gateway.
- Vá `20260327120000_harden_rent_client_integrations.sql` để không nổ nếu bảng `rent.client_integrations` chưa tồn tại.
- Bổ sung constraint trong `20260327_add_rent_client_integrations.sql` để bảng tạo xong là đủ unique/check luôn.
- Thêm `20260409142000_repair_user_roles_and_panel_role_sync.sql` để khôi phục `public.user_roles`, trigger sync và backfill role.
- Vá 2 workflow Supabase để deploy functions vẫn chạy kể cả khi `db push` fail, tránh live site thiếu function.
