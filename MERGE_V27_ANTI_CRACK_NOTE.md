# SunnyMod Fake Lag v2.7 anti-crack merge

Nguồn ghép:
- App nền: SunnyMod_FakeLag_v2.6.zip
- Panel nền: sunnypanel_RuntimeRedeemFix_FLAT(1).zip
- Patch anti-crack: v2.7 engine lock + server strict policy

App đã chỉnh tối thiểu:
- Nâng versionCode 9 / versionName 2.7.
- Thêm EngineGuard.java.
- PacketVpnService và FloatingOverlayService tự kiểm token/session trước khi chạy.
- Thêm heartbeat engine/overlay.
- ProGuard không keep toàn bộ method nhạy cảm.
- AndroidManifest tắt allowBackup và cleartext.

Panel/server đã chỉnh tối thiểu:
- fake-lag-auth hỗ trợ engine/heartbeat token TTL ngắn.
- fake-lag-check strict identity/signature/version hơn.
- Runtime app khi lưu version policy ghi thêm require_signature_match và block_missing_identity.
- Thêm migration cột policy v2.7.

Sau khi push panel:
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy fake-lag-auth --no-verify-jwt
npx supabase functions deploy fake-lag-check --no-verify-jwt

Sau khi build APK release:
- Lấy SHA256 chữ ký release thật.
- Set Server app Fake Lag:
  min_version_code = 9
  block_unknown_signature = ON
  allowed_signature_sha256 = SHA256 release thật
  blocked_version_codes: thêm 8 và các bản cũ.
