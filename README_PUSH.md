# SunnyPanel missing patch

Patch này bổ sung phần còn thiếu sau lần sửa trước:

1. `src/pages/ResetKey.tsx`
   - UI Reset Key nhận nhiều chữ ký key, không chỉ `SUNNY`.
   - Hỗ trợ format `SUNNY-XXXX-XXXX-XXXX`, `FAKELAG-XXXX-XXXX-XXXX`, `FD/FND-XXXX-XXXX-XXXX`.
   - Label kết quả phân biệt Free Fire/SUNNY, Fake Lag, Find Dumps.

2. `src/pages/AdminFakeLagAudit.tsx`
   - Key free Fake Lag người dùng nhận chỉ hiện ở Audit Log.
   - Tìm kiếm được bằng full key, session, trace, ip hash, fingerprint hash.
   - Block/xóa mềm key free ngay trong Audit Log nếu có `license_id`.

3. `AdminFakeLagLicenses.filter-free-issued.patch`
   - Lọc những license đã được phát qua `/free` khỏi khu `AdminFakeLagLicenses`.
   - Khu License Fake Lag chỉ còn key admin tạo tay.

## Cách dùng nhanh

Giải nén thư mục này, rồi đứng trong repo chạy:

```bash
bash /duong/dan/toi/sunnypanel_missing_patch/apply_missing_patch.sh .
npm run build
git status
git add src/pages/ResetKey.tsx src/pages/AdminFakeLagAudit.tsx src/pages/AdminFakeLagLicenses.tsx
git commit -m "Fix reset key UI and separate Fake Lag free audit"
git push
```

## Deploy function cần có từ lần sửa trước

Backend `reset-key` đã sửa trên repo, nhưng vẫn cần deploy Supabase function:

```bash
npx supabase functions deploy reset-key --no-verify-jwt
```
