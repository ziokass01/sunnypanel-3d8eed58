# SunnyMod AI deep admin/backend patch

Patch này lấy ý tưởng từ repo HackerAI nhưng không bê nguyên backend Next/Convex/Stripe/E2B vào production vì hệ thống hiện tại đang chạy Supabase Edge Functions + MiMo API.

## Đã đưa vào

- `/admin/ai` tab **Người dùng**: tìm tài khoản Supabase Auth trước khi cấp quyền, plan/status là dropdown, có Block / Mở block / Xóa quyền.
- `/admin/ai` tab **Key vượt**: prefix mặc định `AI-SUNNY`, grant plan là dropdown, key blocked/disabled có Mở block, có Reset used_count/log và Xóa key.
- Backend `admin-ai-sunny-control`: thêm/chuẩn hóa các action `lookup_user_access`, `delete_user_access`, `reset_redeem_key_usage`, `delete_redeem_key`, `save_integration_policy`.
- Migration `ai_sunny_tool_integrations` + `ai_sunny_tool_audit_logs`: lưu blueprint Convex/Stripe/E2B/Docker dạng tắt mặc định.
- Free plan được set lại thực tế hơn: 30 tin/ngày, 40k token/ngày, 800 token/request.

## Vì sao chưa bật E2B/Docker thật

E2B/Docker không nên chạy trực tiếp trong Supabase Edge Function. Nếu bật thật phải có worker riêng, timeout, giới hạn mạng, không truyền service role/secret production vào sandbox, và audit log riêng. Patch này tạo bảng policy và UI để điều khiển trước, còn runtime thực thi nên làm ở phase sau.

## Sau khi apply

Bắt buộc chạy build trước khi push. Sau push cần `db push --include-all` và deploy lại `admin-ai-sunny-control`. Nếu đã sửa `free-reveal` hoặc `reset-key` ở patch trước thì deploy lại các function đó nữa.
