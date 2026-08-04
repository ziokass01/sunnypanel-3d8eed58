# Free Key direct hotfix commands

## Cách nhanh nhất để web chạy ngay, không deploy lại nhiều lần

1. Mở Supabase Dashboard > SQL Editor.
2. Copy toàn bộ file `HOTFIX_FREE_KEY_RUN_IN_SQL_EDITOR.sql` và Run.
3. Reload trang admin Free Key.
4. Nếu bảng API/Token đang trống thì bấm `+ Thêm API`, điền:
   - API: `https://link4m.co/api-shorten/v2`
   - Token: token API Link4M của bạn
   - Pass: `Cả 2` hoặc tách Pass1/Pass2 tùy ý
5. Bấm `Lưu API/token`.

SQL hotfix này tạo/repair bảng provider + gate token, xóa các dòng legacy thiếu token để UI không còn chặn ở lỗi `Dòng 1: thiếu ô Token`, và reload schema cache.

## Nếu muốn sửa code repo bằng lệnh terminal

Chạy ở thư mục gốc repo:

```bash
# áp patch
curl -L -o /tmp/free-key-direct-hotfix.patch '<UPLOAD_PATCH_URL>'
git apply /tmp/free-key-direct-hotfix.patch

# kiểm tra diff
git diff -- src/pages/AdminFreeKeys.tsx supabase/functions/admin-free-shortlinks/index.ts supabase/migrations/20260531123000_free_key_tokenized_providers.sql

# commit/push
git add src/pages/AdminFreeKeys.tsx supabase/functions/admin-free-shortlinks/index.ts supabase/migrations/20260531123000_free_key_tokenized_providers.sql supabase/migrations/20260531151500_free_key_schema_cache_repair.sql HOTFIX_FREE_KEY_RUN_IN_SQL_EDITOR.sql FREE_KEY_DIRECT_HOTFIX_COMMANDS.md
git commit -m "fix free key api token provider save"
git push origin main
```

Nếu đã chạy SQL Editor ở bước nhanh bên trên thì không cần deploy lại function ngay. Chỉ khi muốn cập nhật phần code chống lỗi legacy lâu dài thì deploy lại frontend/function sau.

## Deploy tối thiểu nếu vẫn muốn đồng bộ server

```bash
supabase functions deploy admin-free-shortlinks
# free-start/free-gate đã deploy rồi thì không cần deploy lại, trừ khi bạn thay logic shortlink trong 2 file đó.
```
