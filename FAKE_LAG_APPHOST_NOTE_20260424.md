# Fake Lag app-host note (2026-04-24)

## Đã thêm trong repo
- Thêm app `fake-lag` vào danh sách **Server app**.
- Thêm route public `/fake-lag` với giao diện tối, chỉ có:
  - ô nhập key
  - nút `Đăng nhập`
  - nút `Get key`
  - 4 nút liên kết: Admin / Ytb / Cộng đồng / Getkey
- Thêm fallback/config seed cho Fake Lag ở màn app-host để không đụng luồng cũ của Free Fire và Find Dumps.
- App-host Fake Lag ưu tiên các tab: cấu hình, runtime, server key, trung tâm điều khiển, audit, trash.

## Chủ đích
- Chỉ **thêm** flow mới, không đổi luồng cũ của Free Fire / Find Dumps.
- Fake Lag dùng chữ ký key riêng mặc định là `FAKELAG` ở seed key type.
- `Get key` public trỏ về `https://mityangho.id.vn/free`.

## Lưu ý bảo vệ app
- Không triển khai logic phá hoại kiểu “nổ all”.
- Nên dùng:
  - signature check / app signing riêng
  - token ngắn hạn từ server
  - bind key theo thiết bị / IP
  - audit log
  - block key / block device / block IP từ admin

## Gợi ý migration backend tiếp theo
Repo frontend đã có khung app-host. Để chạy đủ chức năng Fake Lag, backend nên seed dữ liệu cho:
- `server_apps`
- `server_app_settings`
- `server_app_plans`
- `server_app_features`
- `server_app_reward_packages`
- `server_app_runtime_controls`
- `licenses_free_key_types`
- các bảng audit / session / wallet / runtime đang dùng chung app-host

## Bổ sung version guard 2026-04-24
- Thêm migration `20260424180000_fake_lag_apphost_version_guard.sql`.
- Thêm bảng `server_app_version_policies` để server quyết định min version, blocked version/code/build, update URL, package name và signature SHA-256.
- Thêm bảng `server_app_version_audit_logs` để log mọi lần app check phiên bản.
- Thêm Edge Function public `fake-lag-check`.
- Thêm `fake-lag-check` vào `customer-worker` allowlist.
- Tab Runtime app đã có card **Version guard server-side**.

### Cách chặn phiên bản cũ
1. Vào `Server app` -> `Fake Lag` -> `Runtime app`.
2. Set `Min version code` lớn hơn bản cũ hoặc thêm version cũ vào `Version code bị chặn`.
3. Đảm bảo `Update URL = https://mityangho.id.vn/free`.
4. Bấm lưu.

### Chống sửa version trong app
Không có cách tuyệt đối nếu chỉ tin client tự báo version. Bản này đã thêm các lớp server-side:
- server lưu min version / block list, app chỉ gửi thông tin để server quyết định;
- package name phải khớp `com.fakelag.cryhard8`;
- app gửi SHA-256 chữ ký cài đặt;
- admin có thể nhập SHA-256 chữ ký release và bật `block_unknown_signature` để chặn APK repack ký lại.

Muốn cứng hơn nữa, bước sau nên thêm Play Integrity / App Attest tương đương hoặc HMAC request bằng secret sinh động từ server, không hardcode lâu dài trong app.
