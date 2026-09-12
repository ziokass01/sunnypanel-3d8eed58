# FREE Flow 500s Session + UX Smooth Fix — 2026-05-23

## Phạm vi đã sửa

Chỉ sửa luồng public `/free`, `/free/gate`, `/free/claim` và Edge Functions FREE tương ứng. Không sửa `verify-key`, không đổi JSON verify app/key, không đổi logic tạo Link4M bucket ổn định.

## Thay đổi chính

1. **Session FREE hết hạn cứng sau 500 giây**
   - `free-start` tạo `expires_at` theo `free_session_absolute_seconds`, mặc định/capped ở `500` giây.
   - `out_expires_at` không còn sống 30 phút riêng nữa, mà bằng `expires_at` của session.
   - Backend `free-gate` và `free-reveal` vẫn là nơi chặn cuối: quá 500 giây thì không gate/claim được và không tạo key.

2. **Tách timer rõ nghĩa**
   - Thêm migration cấu hình:
     - `free_session_absolute_seconds` mặc định `500`.
     - `free_claim_window_seconds` mặc định `180`, nhưng không vượt quá thời gian session còn lại.
     - `free_close_deadline_seconds` mặc định `10`, tách khỏi timer sống/chết của session.
   - `free_return_seconds` giữ vai trò UI/auto-return, không dùng làm tuổi thọ session chính nữa.

3. **Gate tự repair session bằng out_token**
   - `/free/gate` frontend nếu thiếu `sid` nhưng còn `out_token` sẽ gọi `/free-resolve` để lấy lại `session_id` trước khi báo lỗi.
   - Giảm lỗi `SESSION_CLOSED`/thiếu session do mobile redirect, mất query hoặc storage bị lệch.

4. **State sống ưu tiên theo tab**
   - `freeFlow.ts` và `fingerprint.ts` đọc `sessionStorage` trước, `localStorage` là fallback cũ.
   - Giảm lỗi nhiều tab ghi đè session nhau.
   - Bundle frontend chỉ được coi là fresh trong `500s`, khớp với TTL backend.

5. **UI gọn hơn đúng yêu cầu**
   - Bỏ `FreeNotice` khỏi `/free/claim`; thông báo popup/notice chỉ còn ở `/free`.
   - Bỏ card `Thiết bị hiện tại` khỏi `/free/claim`; card quota/lịch sử chỉ còn ở trang chọn key `/free`.
   - Ẩn cụm debug nhỏ `Trạng thái / Loại phiên / Tiếp theo` ở `/free/gate`, chỉ hiện khi `debug=1` trong môi trường dev.

## File đã chỉnh

- `src/pages/FreeLanding.tsx`
- `src/pages/FreeGate.tsx`
- `src/pages/FreeClaim.tsx`
- `src/lib/freeFlow.ts`
- `src/features/free/fingerprint.ts`
- `src/features/free/free-config.ts`
- `supabase/functions/free-start/index.ts`
- `supabase/functions/free-gate/index.ts`
- `supabase/functions/free-reveal/index.ts`
- `supabase/functions/free-config/index.ts`
- `supabase/migrations/20260523190000_free_flow_session_500s_ux_smooth.sql`

## Test đã chạy

```bash
npx tsc --noEmit --pretty false
```

Kết quả: không có lỗi TypeScript.

`npm run build` chưa chạy được trong sandbox vì repo zip không có `node_modules`; lệnh `npm ci` bị môi trường dừng giữa chừng. Khi deploy thật nên chạy lại:

```bash
npm ci
npm run build
npx supabase db push
npx supabase functions deploy free-start --no-verify-jwt
npx supabase functions deploy free-gate --no-verify-jwt
npx supabase functions deploy free-reveal --no-verify-jwt
npx supabase functions deploy free-config --no-verify-jwt
npx supabase functions deploy free-resolve --no-verify-jwt
```

## Lưu ý vận hành

Sau deploy, phiên vượt link public có giới hạn cứng 500 giây. Nếu người dùng hoàn tất sau mốc này, backend trả lỗi hết hạn và không phát key. Đây là chủ đích để giữ anti-bypass nhưng vẫn đủ thời gian cho luồng Link4M bình thường.
