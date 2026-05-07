# AI Sync / Key Flow Hotfix — 2026-05-07

Phạm vi sửa: chỉ các phần SunnyMod Coding AI, AI free-key flow và reset AI key. Không đụng Fake Lag, Find Dumps, Free Fire legacy ngoài phần detect/branch AI đã có sẵn.

## Lỗi chính đã xử lý

1. **User bị block AI vẫn rơi về free fallback**
   - `ai-sunny-chat` trước đó chỉ query `ai_sunny_user_access` với `status = active`.
   - Khi admin block user, row bị query mất, server hiểu như chưa có quyền và fallback về free.
   - Đã sửa thành query theo `user_id` trước, nếu `status = blocked` thì trả `AI_USER_BLOCKED` và fail-closed.

2. **Redeem key xong frontend chưa sync model/quota từ server**
   - `SunnyModCodingAI.tsx` sau khi redeem thành công giờ gọi lại `ai-sunny-chat` action `profile`.
   - Sidebar, `currentPlan`, `allowed_models` và khóa/mở model lấy lại từ server ngay.
   - Nếu server báo block thì UI cũng fail-closed, không dùng localStorage để mở model.

3. **Key AI có `allowed_models` nhưng access user không giữ override**
   - `ai-sunny-redeem` giờ lưu `allowed_models_override` vào `ai_sunny_user_access.metadata`.
   - `ai-sunny-chat` merge `plan.allowed_models` với override server-side rồi mới cho chat.

4. **AI key từ `/free` còn trả `allow_reset: false` và session có thể kẹt `revealing`**
   - `free-reveal` nhánh AI giờ update session sang `revealed`, `reveal_count = 1`, `revealed_at` rõ ràng.
   - AI key trả `allow_reset: true` vì reset đã có nhánh riêng theo prefix `AI-SUNNY`.
   - Monitor insert vào `licenses_free_issues` là best-effort, không làm fail phát key AI.

5. **Sai status giữa user access và redeem key**
   - `ai_sunny_user_access.status`: `active / blocked / expired`.
   - `ai_sunny_redeem_keys.status`: `active / disabled / expired`.
   - `admin-ai-sunny-control` giờ map riêng, tránh gửi `blocked` vào redeem key hoặc `disabled` vào user access gây lỗi constraint.
   - UI admin đổi nút key từ `blocked` sang `disabled`.

6. **Reset AI key khi hết hạn nên là `expired`, không phải `disabled`**
   - `reset-key` nhánh AI giờ set `expired` nếu penalty làm key hết thời gian.

## File đã sửa

- `supabase/functions/ai-sunny-chat/index.ts`
- `supabase/functions/ai-sunny-redeem/index.ts`
- `supabase/functions/free-reveal/index.ts`
- `supabase/functions/admin-ai-sunny-control/index.ts`
- `supabase/functions/reset-key/index.ts`
- `src/pages/SunnyModCodingAI.tsx`
- `src/pages/AdminSunnyModAI.tsx`

## Kiểm tra đã chạy

```bash
tsc --noEmit --skipLibCheck --pretty false
```

Kết quả: không báo lỗi TypeScript.

## Checklist test sau deploy

```bash
supabase functions deploy ai-sunny-chat --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
supabase functions deploy ai-sunny-redeem --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
supabase functions deploy free-reveal --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
supabase functions deploy admin-ai-sunny-control --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
supabase functions deploy reset-key --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
```

Test cần làm:

1. Admin cấp user `max` rồi refresh `/coding-ai`: model Pro/Omni mở theo `allowed_models` server.
2. Admin block user: `/coding-ai` không còn fallback free để dùng tiếp.
3. `/free` nhận key AI: response phải có `AI-SUNNY-...` và `allow_reset: true`.
4. Nhập key ở `/coding-ai`: nút hiện đang kiểm tra, thành công thì sidebar/model cập nhật ngay.
5. Reset key `AI-SUNNY-...`: dùng nhánh `ai_sunny_redeem_keys`, không tìm trong `licenses` legacy.

## Test hotfix 2026-05-07 v3

- Fixed `src/test/rent-portal.test.ts` failure: `buildDashboardStats is not a function`.
- Root cause: the Rent Portal UI helper had been renamed to `buildTongQuanStats`, while the test and older imports still expected `buildDashboardStats`.
- Safe fix: kept `buildTongQuanStats` unchanged for the current UI and exported `buildDashboardStats` as a backward-compatible alias. No rent logic, key state, or backend sync logic was changed.
