BẢN NÀY ĐÃ CHUYỂN THEO HƯỚNG API CỐ ĐỊNH.

TÓM TẮT:
- Function calls ở frontend giờ ưu tiên VITE_PUBLIC_API_BASE_URL
- Worker không còn màu NOVA, giờ là gateway chung
- Có thể đổi project A/B bằng cách đổi ACTIVE_SUPABASE_URL trong customer-worker/.dev.vars
- Auth/admin vẫn giữ trực tiếp qua VITE_SUPABASE_URL để tránh vỡ session

LỆNH NHANH:
cp project-switch/api-profile.template.local project-switch/project-a.api.local
cp project-switch/api-profile.template.local project-switch/project-b.api.local
./scripts/use-api-upstream.sh project-a
./scripts/api-upstream-status.sh
