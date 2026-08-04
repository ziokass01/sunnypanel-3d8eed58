# Fake Lag hotfix 2026-04-26: no HTTP 403 preflight + no IP-wide false block

## Lỗi gặp thực tế

- `fake-lag-check` vẫn trả HTTP `403` nên app hiểu là backend lỗi / yêu cầu cập nhật.
- Nhiều người nhập key đúng nhưng app báo key lỗi.
- Nguyên nhân chính: security block đang match cả `device_id` **hoặc** `ip_hash`. Với mạng di động/NAT/proxy, nhiều người có thể bị chung một IP hash; một máy risk/crack có thể làm người khác nhập key đúng cũng bị chặn.

## Đã sửa

1. `fake-lag-check`:
   - Mọi deny thông thường trả HTTP `200`.
   - Lý do chặn vẫn nằm trong JSON: `ok`, `allowed`, `decision`, `code`, `http_status_hint`.
   - Policy load lỗi sẽ soft-allow preflight để không làm key đúng thành key sai. `fake-lag-auth` vẫn là cổng license chính.
   - Thêm catch cuối cùng để preflight không rơi thành HTTP 403/503.

2. `fake-lag-auth`:
   - Không hard-block login theo `ip_hash` nữa.
   - Security block chỉ áp dụng theo `device_id`.
   - Runtime risk vẫn audit đầy đủ IP trong `detail`, nhưng block row mới để `ip_hash = null` và reason `RUNTIME_RISK_DEVICE_ONLY`.
   - Rate limit trả HTTP `200` + JSON `{ ok:false, msg:'RATE_LIMIT' }` để app không hiểu là server sập.

3. SQL migration:
   - Clear toàn bộ active security block cũ của `app_code = 'fake-lag'` để người dùng bị dính block nhầm nhập lại được key.

## Deploy đúng project Fake Lag

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy fake-lag-check --no-verify-jwt
npx supabase functions deploy fake-lag-auth --no-verify-jwt
```

Không cần build lại APK.

## Kiểm tra sau deploy

Trong Supabase Edge Function invocations, request mới của `fake-lag-check` không còn HTTP `403`. Nếu client bị chặn đúng chính sách, status vẫn là `200`, body sẽ có:

```json
{
  "ok": false,
  "decision": "blocked",
  "code": "PACKAGE_NOT_ALLOWED",
  "http_status_hint": 403
}
```

Như vậy app không còn hiện lỗi backend chung, và key đúng không bị báo sai vì một IP khác bị block.
