# FIX NOTE 2026-04-15: account switch stale plan + unlock bootstrap

1. App không còn trộn cache gói/credit giữa 2 tài khoản khác nhau.
2. Đổi tài khoản sẽ reset scope runtime rồi tự đồng bộ lại.
3. Màn Mở khóa/Runtime Center sẽ tự làm mới nếu vừa đổi tài khoản hoặc đang không có session.
4. Repo `unlock_feature` tự bootstrap session theo `account_ref + device_id` nếu token cũ mất hoặc lệch.
5. `unlock_feature` trả lại `session_token` mới để app giữ phiên vừa bootstrap.
