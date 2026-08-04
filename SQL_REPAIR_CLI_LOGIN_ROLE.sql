-- CHỈ CHẠY MỘT LẦN trong Supabase Dashboard -> SQL Editor của project mới.
-- Dùng khi Supabase CLI báo:
--   Failed to create login role
--   role "postgres" is a member of role "cli_login_postgres"
--
-- Đây là role CLI bị sao chép sai khi restore/clone. Sau khi xóa, Supabase CLI
-- sẽ tự tạo lại role đúng ở lần `supabase link` hoặc `supabase db push` kế tiếp.

DROP ROLE IF EXISTS cli_login_postgres;
