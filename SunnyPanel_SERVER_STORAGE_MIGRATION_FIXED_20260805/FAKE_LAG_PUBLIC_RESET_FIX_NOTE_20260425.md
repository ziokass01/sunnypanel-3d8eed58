# Fake Lag public Reset Key fix — 2026-04-25

## Phạm vi sửa

Chỉ đụng Fake Lag:

- `supabase/functions/reset-key/index.ts`
- `supabase/migrations/20260425125100_fake_lag_public_reset_accept_fakelag.sql`

Không đụng các phần sau:

- session/auth mobile
- `server-app-runtime`
- credit/wallet
- Free Fire key
- Find Dumps key
- UI app mới ngoài logic reset key public

## Lỗi trước khi sửa

Trang public `/reset-key` nhận format `FAKELAG-XXXX-XXXX-XXXX`, nhưng backend `reset-key` vẫn ưu tiên flow RPC chung `get_public_key_info/public_reset_key` của hệ license cũ.

Trong các migration Fake Lag cũ, nhiều rule/key Fake Lag bị để:

- `license_access_rules.allow_reset = false`
- `licenses.public_reset_disabled = true` hoặc kế thừa trạng thái khóa reset

Vì vậy key FAKELAG có thể tồn tại trong bảng `licenses` nhưng public Reset Key vẫn rơi về thông báo chung:

```text
KEY_UNAVAILABLE
Không thể lấy thông tin key
```

## Logic mới

`reset-key/index.ts` hiện có nhánh riêng cho key bắt đầu bằng `FAKELAG-`:

1. Check key:
   - đọc trực tiếp bảng `licenses`
   - chỉ chấp nhận key có `app_code='fake-lag'` hoặc prefix `FAKELAG-`
   - trả về `key_kind='FAKE_LAG'`, `app_code='fake-lag'`
   - dùng `verify_count/max_verify` làm số lượt dùng trên UI

2. Reset key:
   - chỉ chạy cho key `FAKELAG-...`
   - không gọi RPC reset chung của Free Fire/Find Dumps
   - reset `verify_count` về `0`
   - xóa `license_devices` của key đó
   - best-effort xóa `license_ip_bindings` nếu bảng tồn tại
   - tăng `public_reset_count`
   - không trừ hạn, không đụng session, không đụng credit

## Lưu ý cực quan trọng

Không gom nhánh Fake Lag quay lại RPC chung `public_reset_key`. RPC chung có penalty/reset semantics của hệ license khác, còn Fake Lag đang dùng lượt verify/use riêng.

Không đổi logic này sang `max_devices` vì Fake Lag đã chốt: IP/thiết bị là quota lấy key ở `/free`, còn license Fake Lag giới hạn bằng `verify_count/max_verify`.

Nếu sau này muốn khóa public reset cho một key Fake Lag riêng lẻ thì chỉ set:

```sql
update public.licenses
set public_reset_disabled = true
where key = 'FAKELAG-XXXX-XXXX-XXXX';
```

Không set lại toàn bộ `license_access_rules.allow_reset=false` cho `fake-lag`, vì sẽ làm public reset không dùng được cho tất cả key FAKELAG.

## Deploy

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy reset-key
```

Sau đó deploy lại Cloudflare Pages/GitHub Actions cho frontend nếu cần.
