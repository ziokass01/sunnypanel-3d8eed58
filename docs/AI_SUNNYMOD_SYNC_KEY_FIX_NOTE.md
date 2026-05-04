# SunnyMod AI sync/key fix

## Lỗi đã xử lý

1. **Admin đã set gói Max/Pro nhưng trang `/coding-ai` vẫn khóa model/chức năng**
   - Nguyên nhân: frontend dùng `localStorage`/suy luận plan cũ, chưa hỏi server ngay sau khi admin đổi quyền.
   - Fix: `ai-sunny-chat` có thêm `action: "profile"`; frontend gọi khi login, khi focus lại tab, khi quay lại trình duyệt.
   - UI lock/unlock dựa vào `allowed_models` server trả về thay vì chỉ đoán từ tên gói.

2. **Admin Test GetKey với `aisunny_h01` báo `LICENSE_INSERT_FAILED`**
   - Nguyên nhân: key AI bị đi nhầm nhánh legacy `public.licenses`, trong khi AI phải phát qua `ai_sunny_redeem_keys`.
   - Fix: `free-admin-test` có branch riêng cho `app_code = ai-coding`, sinh key dạng `AI-SUNNY-XXXX-XXXX-XXXX`, hash bằng `AI_SUNNY_KEY_PEPPER`, lưu vào `ai_sunny_redeem_keys`.
   - `licenses_free_issues` chỉ còn là log best-effort, lỗi log không làm fail phát key AI.

3. **Plan model chưa đồng bộ**
   - Migration cập nhật lại các gói:
     - free/trial: `mimo-v2.5`
     - basic: `mimo-v2.5`, `mimo-v2-pro`
     - pro: thêm `mimo-v2.5-pro`
     - max: thêm `mimo-v2.5-pro`, `mimo-v2-omni`, `mimo-v2.5-tts`

## Sau khi apply

Chạy build trước khi push:

```bash
npm run build
```

Sau khi push, cần chạy DB + deploy function:

```bash
npx supabase db push --include-all --yes
npx supabase functions deploy ai-sunny-chat --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
npx supabase functions deploy free-admin-test --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
npx supabase functions deploy ai-sunny-redeem --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
```

Nếu đang test reset key AI thì deploy thêm:

```bash
npx supabase functions deploy reset-key --project-ref uvqgpgkaxpiczasfwzgm --no-verify-jwt
```

## Lưu ý an toàn

Không bật sandbox/terminal thật nếu chưa có worker riêng và chưa tách secret. Không đưa `SUPABASE_SERVICE_ROLE_KEY`, `MIMO_API_KEY` hoặc secret production vào sandbox/E2B/Docker job.
