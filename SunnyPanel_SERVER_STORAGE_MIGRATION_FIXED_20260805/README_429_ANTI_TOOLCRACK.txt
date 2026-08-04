PATCH_429_ANTI_TOOLCRACK

Đã kiểm tra tool crack bạn gửi:
- HOOK URL: hook strlen rồi sửa URL trong bộ nhớ.
- OffSet Hook URL: hook curl_easy_setopt(CURLOPT_URL) rồi đổi URL sang server giả.

Bản patch này tập trung vào lỗi 429 và vẫn giữ SunnyAntiCrack hiện tại:
1) SunnyLoginModule.hpp
   - Chặn bấm Login/auto-login spam sau khi server trả 429.
   - Poll session gặp 429 thì backoff 5 phút, không hammer endpoint.
   - Vẫn fail-closed theo local lease tối đa 15 phút.

2) supabase/functions/verify-key/index.ts
   - Rate-limit chuyển sang env cấu hình được.
   - Mặc định nới nhẹ để test không tự khóa quá nhanh, nhưng vẫn chặn render-loop spam.
   - 429 trả thêm retry_after_seconds để dễ debug.

3) sql/SQL_RESET_429.sql
   - Dùng để xem log nguyên nhân 429 và reset counter sau khi đã sửa app.

Lưu ý bảo mật quan trọng:
- File hiện tại dùng HMAC cho server_sig. HMAC secret nằm trong client nên chỉ là lớp chống tool đơn giản.
- Muốn chống fake server mạnh hơn: server nên ký Ed25519 bằng private key; app chỉ nhúng public key.
