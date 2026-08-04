# virbox

Thư mục tạm để đặt APK đầu vào/đầu ra khi chạy Virbox trên Codespace.

## APK cần đưa vào thư mục này

- `SunnyMod - Fake Lag_3.2.apk`
  - SHA256 gốc đã kiểm tra: `9c288fc2b02d162f52d0a5a5794f2055f8597fdc6c87e22f0b63546029a10e94`
  - Có `classes.dex`
  - Có native lib:
    - `lib/arm64-v8a/libsunnyguard.so`
    - `lib/armeabi-v7a/libsunnyguard.so`

- `SunnyMod_V1.0.8.apk`
  - SHA256 gốc đã kiểm tra: `0c8cf3c4896b5b4f06c35101beb72c45bd59c5d8c82a68d88aaf2474324304f3`
  - Có `classes.dex`
  - Không có native `.so`

## Lưu ý bảo mật

Repo hiện đang public. Không nên commit APK release, APK đã Virbox, keystore hoặc file license lên repo public. Nên upload APK trực tiếp vào Codespace khi cần chạy Virbox, hoặc đổi repo sang private trước khi commit binary.

## Luồng khuyến nghị

```bash
cd ~/sunnypanel-3d8eed58
mkdir -p virbox/input virbox/output

# Upload 2 APK vào virbox/input rồi chạy Virbox CLI.
```

Sau khi Virbox xong, lấy hash của APK cuối cùng rồi mới cập nhật Supabase policy/hash để tránh lệch hash.