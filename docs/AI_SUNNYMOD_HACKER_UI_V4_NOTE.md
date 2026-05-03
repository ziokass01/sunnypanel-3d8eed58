# SunnyMod Coding AI - Hacker style UI v4

Patch này chỉ đụng `src/pages/SunnyModCodingAI.tsx` và thêm note này.

## Lấy ý tưởng từ `hackerai-main.zip`

- Sidebar tối kiểu ChatGPT/HackerAI.
- Nút tạo đoạn chat mới.
- Search lịch sử chat.
- Danh sách chat gần đây có thể bấm vào để tiếp tục.
- Active thread được lưu trong localStorage và URL hash `#t=<thread_id>`.
- Draft input lưu theo từng thread.
- Model selector dạng popover nhỏ, model chưa mở sẽ khóa.
- Plus menu dạng popover nhỏ, không bung thành một cục lớn che giao diện.
- Markdown renderer mới: code block, bảng, bullet, quote, heading, copy code/copy message.
- Textarea ép chữ trắng/caret trắng để tránh lỗi chữ trùng nền đen trên Chrome Android.
- Dialog khóa có 2 kiểu: đăng nhập hoặc liên hệ admin qua `https://zalo.me/84373752504`.

## Không đưa vào patch này

- Không bê Convex/Stripe/WorkOS/E2B/docker từ repo HackerAI vào production vì hệ thống hiện tại đang dùng Supabase và MiMo API.
- Không bật sandbox/terminal thật. UI vẫn khóa các mục đó để tránh rủi ro server.
- Không sửa admin/free/reset function trong patch này để tránh nổ chéo. Các hotfix admin/reset đã nằm ở patch riêng trước đó.

## Sau khi apply

Chạy:

```bash
npm run build
```

Nếu build xanh mới commit/push.
