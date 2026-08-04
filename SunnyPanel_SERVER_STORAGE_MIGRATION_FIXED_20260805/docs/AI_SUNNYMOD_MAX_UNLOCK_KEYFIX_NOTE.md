# SunnyMod AI max unlock + free key fix

Patch khoanh vùng riêng cho SunnyMod Coding AI. Không chạm Fake Lag, Find Dumps core, reset key public hay logic giá/credit.

## Lỗi đã rà từ ảnh

1. `npx supabase db push` fail tại migration `20260504064500_ai_sunny_sync_key_fix.sql` vì dòng `aisunny_h01` insert vào `licenses_free_key_types` thiếu 3 cột NOT NULL: `kind`, `value`, `sort_order`.
2. Admin Test GetKey chọn `aisunny_h01` trả `LICENSE_INSERT_FAILED` vì bản function cũ có thể rơi về đường insert `public.licenses` thay vì cấp key AI ở `ai_sunny_redeem_keys`.
3. `/coding-ai` sau khi admin mở max/pro vẫn có thể bị UI khóa model do cache plan cũ; UI phải sync profile từ server và cho phép model theo `allowed_models` server trả về.
4. Chọn model TTS để chat text làm upstream trả HTTP 400 vì TTS chưa có endpoint riêng. Patch này fail-safe: khi chat text đang chọn TTS thì tự chuyển request sang model chat hợp lệ để không nổ 400.
5. Tin nhắn toán học dạng `\[` `\]` hiển thị thô. Patch frontend nhận block LaTeX và render thành khung math sạch, không phơi delimiter thô trong bubble chat.

## File bị sửa

- `src/pages/SunnyModCodingAI.tsx`
- `supabase/functions/ai-sunny-chat/index.ts`
- `supabase/migrations/20260504064500_ai_sunny_sync_key_fix.sql`
- `docs/AI_SUNNYMOD_MAX_UNLOCK_KEYFIX_NOTE.md`

## Lưu ý vận hành

Sau khi apply patch:

```bash
npm run build
git add \
  src/pages/SunnyModCodingAI.tsx \
  supabase/functions/ai-sunny-chat/index.ts \
  supabase/functions/free-admin-test/index.ts \
  supabase/functions/free-reveal/index.ts \
  supabase/migrations/20260504064500_ai_sunny_sync_key_fix.sql \
  docs/AI_SUNNYMOD_MAX_UNLOCK_KEYFIX_NOTE.md

git status --short
git commit -m "fix SunnyMod AI max unlock and free key issuing"
git fetch origin
git rebase origin/main
git push -u origin main

npx supabase db push --include-all --yes
npx supabase functions deploy ai-sunny-chat --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
npx supabase functions deploy free-admin-test --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
npx supabase functions deploy free-reveal --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
npx supabase functions deploy ai-sunny-redeem --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
```

## Test nhanh sau deploy

1. Admin Test GetKey chọn `aisunny_h01`, `dry_run=false` phải trả `ADMIN_TEST_OK`, không còn `LICENSE_INSERT_FAILED`.
2. Mở `/coding-ai`, đăng nhập account đã được admin mở max/pro, mở dropdown model phải chọn được model tương ứng.
3. Gửi câu `Giải bài toán y'=xy` kể cả khi đang chọn TTS không được lỗi `Request failed (400)`.
4. Bubble trả lời toán không còn hiện riêng các dòng `\[` và `\]`.

