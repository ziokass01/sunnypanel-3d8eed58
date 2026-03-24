# Hướng dẫn UI Login + Rent Verify Key (đã ẩn thông tin nhạy cảm)

Tài liệu này dùng để chia sẻ/cấu hình mà không lộ bí mật.  
Các chỗ cần điền được đánh dấu dạng **`<...>`**.

---

## 1) Endpoint và payload chuẩn (Supabase Edge Function)

**POST** `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/rent-verify-key`  
Header:
- `Content-Type: application/json`

Body JSON:
```json
{
  "username": "<name>",
  "key": "XXXX-XXXX-XXXX-XXXX",
  "device_id": "<device_id>",
  "ts": 1710000000,
  "sig": "HMAC_SHA256_HEX(user_hmac_secret, username|key|device_id|ts)"
}
```

Chuỗi ký (`message`) đúng định dạng:
```
username|key|device_id|ts
```

- `ts` là Unix epoch **giây**.

---

## 2) Chỗ người dùng nhập trong UI Login

- `Username`: nhập tên tài khoản
- `Key`: dán key (giữ nguyên dấu `-` nếu có)
- Nút:
  - **Paste**: lấy clipboard → dán vào ô Key
  - **Verify/Login**: gọi API verify
  - **YouTube / Zalo / GetKey**: mở link ngoài

---

## 3) Không hardcode secret trong client

**Không nhúng `user_hmac_secret` vào app client.**  
Nếu nhúng vào C++ thì IDA/Ghidra vẫn trích ra được.

Khuyến nghị:
- Server tự verify (client không cần secret), hoặc
- Server cấp token/ngữ cảnh ký ngắn hạn (chấp nhận vẫn có rủi ro lộ).

---

## 4) CA bundle để fix SSL 60

File CA: **`sunny_cacert.pem`** (đi kèm).

Với libcurl:
- `CURLOPT_CAINFO` trỏ tới file pem
- `CURLOPT_SSL_VERIFYPEER = 1`
- `CURLOPT_SSL_VERIFYHOST = 2`

Debug:
- `CURLOPT_VERBOSE = 1`

---

## 5) Checklist nhanh

- Paste không dán: kiểm tra JNI/clipboard hoạt động
- Link không mở: thêm `FLAG_ACTIVITY_NEW_TASK` khi startActivity
- SSL 60: CAINFO rỗng / máy sai ngày giờ / chain lạ (xem log verbose)
