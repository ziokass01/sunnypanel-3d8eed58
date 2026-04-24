# Fix report 2026-04-09: deploy repair + panel role repair

## Đã sửa

1. **Không còn fail ở `rent.client_integrations`**
   - Giữ nguyên cấu trúc migration hiện tại, không đổi tên file cũ.
   - Bổ sung ràng buộc ngay trong file tạo bảng `20260327_add_rent_client_integrations.sql`.
   - Làm `20260327120000_harden_rent_client_integrations.sql` an toàn nếu bảng chưa tồn tại.

2. **Thêm migration repair cho `public.user_roles`**
   - File mới: `supabase/migrations/20260409142000_repair_user_roles_and_panel_role_sync.sql`
   - Tự tạo lại `public.user_roles` nếu bị thiếu.
   - Tạo lại `has_role`, `get_my_panel_role`, trigger sync từ `auth.users.raw_app_meta_data`.
   - Backfill role hiện có từ `auth.users` vào `public.user_roles`.

3. **Làm `MODERATOR_SETUP.sql` an toàn hơn**
   - Không còn nổ ngay nếu `public.user_roles` chưa có.
   - Vẫn set metadata role trước.

## Cách push

```bash
supabase db push --include-all
```

Sau khi push xong, đăng xuất và đăng nhập lại để JWT nhận role mới.
