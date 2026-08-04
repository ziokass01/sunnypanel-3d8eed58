# Final hotfix 2026-04-25: Fake Lag public reset + Admin Test fd_credit

Chỉ sửa hai lỗi còn lại theo ảnh:

1. `/reset-key` public không lấy/reset đúng key `FAKELAG-*`.
2. `Free keys monitor -> Admin Test GetKey` với `fd_credit` báo `LICENSE_INSERT_FAILED`.

## Phạm vi đã đụng

- `supabase/functions/reset-key/index.ts`
- `src/pages/ResetKey.tsx`
- `supabase/functions/admin-free-test/index.ts`
- `supabase/functions/free-admin-test/index.ts` alias tương thích
- `supabase/migrations/20260425131500_fake_lag_reset_admin_test_final_fix.sql`

Không đụng runtime session, không đụng wallet/credit consume, không đụng app Android.

## Logic Fake Lag reset

Fake Lag là license legacy trong `public.licenses`, nhưng nhận diện bằng prefix `FAKELAG-*` và `app_code='fake-lag'`.
Public reset của Fake Lag chỉ làm các việc sau:

- nhận key `FAKELAG-XXXX-XXXX-XXXX` trực tiếp trong Edge Function `reset-key`;
- đọc license bằng `select("*")` để tránh vỡ nếu DB production thiếu vài cột phụ;
- reset `verify_count` về `0`;
- xóa binding thiết bị trong `license_devices`;
- best-effort xóa `license_ip_bindings` nếu bảng đó tồn tại;
- tăng `public_reset_count`;
- không trừ hạn;
- không đụng session;
- không đụng credit/wallet.

`ResetKey.tsx` có thêm lớp tự-heal rất nhỏ: nếu backend cũ/trung gian trả response reset dạng `OK` nhưng thiếu status card, frontend tự gọi lại action `check` để tránh màn lỗi khó hiểu `Không thể lấy thông tin key / OK`.

## Logic Admin Test fd_credit

`fd_credit` là Find Dumps server-app redeem key, không phải key legacy trong `public.licenses`.
Vì vậy Admin Test không được insert vào `licenses` nữa. Với `app_code='find-dumps'`, function giờ mint key trong:

```text
public.server_app_redeem_keys
```

Key phát ra dùng prefix `FND-*`, ghi lại session/issue vào:

```text
public.licenses_free_sessions
public.licenses_free_issues
```

Các type Fake Lag/Free Fire legacy vẫn đi nhánh cũ, không trộn với Find Dumps.

## Deploy đúng

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy reset-key
npx supabase functions deploy admin-free-test
npx supabase functions deploy free-admin-test
```

Sau đó deploy lại web panel để lấy `ResetKey.tsx` mới.
