Bản vá 2026-03-25

Đã sửa:
1. Reset Key frontend (`src/pages/ResetKey.tsx`)
- Check key không còn bắt Turnstile.
- Reset key mới bắt Turnstile.
- Sau mỗi lần reset sẽ reset widget để lấy token mới, tránh lỗi token hết hạn/đã dùng.

2. Reset Key backend (`supabase/functions/reset-key/index.ts`)
- `require_turnstile` chỉ áp cho action `reset`.
- `check` vẫn xem trạng thái bình thường.
- Có verify optional nếu client gửi token ở action check.

3. Free Claim frontend (`src/pages/FreeClaim.tsx`)
- Không auto reveal trước khi load xong free-config.
- Không auto reveal khi Turnstile đang bật mà chưa có token.
- Reset widget sau mỗi lần verify để tránh reuse token.
- Báo lỗi rõ hơn cho TURNSTILE_REQUIRED và TURNSTILE_FAILED.

4. Free Turnstile widget (`src/features/free/TurnstileWidget.tsx`)
- Chờ script load hoàn chỉnh trước khi render.
- Xóa token khi widget lỗi/hết hạn.

5. Reset Turnstile widget (`src/components/turnstile/TurnstileWidget.tsx`)
- Chờ script load hoàn chỉnh trước khi render.
- Xóa token khi widget lỗi/hết hạn.

6. Admin Free Keys (`src/pages/AdminFreeKeys.tsx`)
- Link public free/gate/claim không còn tự lấy admin subdomain.
- Nếu đang ở admin.* sẽ tự chuyển sang domain public.
- Có hỗ trợ override qua `VITE_PUBLIC_BASE_URL`.
