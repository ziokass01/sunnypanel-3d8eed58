# Fake Lag v2.8 anti-crack hardening

Đã thêm:
- Package mới: `com.fakelag.sunnymod`.
- Version mới: `versionCode 10`, `versionName 2.8`.
- Engine/overlay heartbeat fail-closed.
- PacketVpnService rải local gate trong `onStartCommand`, `run`, `restartTunnel`, và vòng `loop`.
- EngineGuard kiểm package/signature/build id đã lưu sau session OK.
- Anti-Frida/Xposed/Substrate/debug mở rộng qua class loader, maps, unix socket, tcp port, TracerPid.
- Server `fake-lag-auth` tự ghi audit và block thiết bị/IP khi gặp risk nhiều lần.
- Migration thêm `server_app_security_blocks` và policy knobs.

Sau khi build APK mới, server Fake Lag cần:
- `min_version_code = 10`
- `allowed_package_names` có `com.fakelag.sunnymod`
- `block_unknown_signature = ON`
- `allowed_signature_sha256 = SHA256 release thật`
- `blocked_version_codes` thêm `9,8,...`
