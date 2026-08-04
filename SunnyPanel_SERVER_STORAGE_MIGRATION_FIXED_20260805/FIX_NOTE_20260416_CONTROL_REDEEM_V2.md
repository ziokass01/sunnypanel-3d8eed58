# FIX NOTE 2026-04-16 V2

## Trọng tâm lần này

### 1. Redeem runtime logic làm sâu thêm
Đã nối phần rule từ panel xuống runtime thật ở `supabase/functions/_shared/server_app_runtime.ts`.

Các rule đã xử lý:
- giới hạn mỗi **IP / device / account** theo từng redeem key
- **gói cao hơn** có thể nâng plan nếu `apply_plan_if_higher = true`
- **gói thấp hơn** mặc định giữ gói hiện tại nếu `keep_higher_plan = true`
- **đúng gói** mặc định chỉ cộng credit nếu `same_plan_credit_only = true`
- chỉ khi `allow_same_plan_extension = true` thì cùng gói mới xét kéo dài hạn
- nếu `apply_days_only_if_greater = true` thì ngày thấp hơn mức đang còn sẽ bị bỏ qua
- credit redeem **cho phép âm/dương** khi cộng vào ví

### 2. Create Redeem lưu dữ liệu sạch hơn
`src/pages/AdminServerAppRedeem.tsx`
- lưu `title` và `description` vào đúng cột của `server_app_redeem_keys`
- vẫn giữ `gift_tab_label` ở tab Create Redeem
- nhãn này không còn phải chỉnh ở Config

### 3. Gift tab label giữ ở Create Redeem
`src/pages/AdminServerAppDetail.tsx`
- phần Config chỉ hiển thị read-only
- ý nghĩa là admin xem ở đây được, nhưng chỉnh chính thức tại tab Create Redeem

### 4. Index cho runtime redeem
Thêm migration:
- `supabase/migrations/20260416153000_redeem_runtime_limits_indexes.sql`

Mục đích:
- tăng tốc đếm số lần redeem theo account/device/ip
- giảm cảnh rule đã đúng nhưng query đếm bị chậm hoặc hụt hơi khi dữ liệu lớn lên

## File chính đã sửa
- `src/pages/AdminServerAppRedeem.tsx`
- `src/pages/AdminServerAppDetail.tsx` (giữ read-only gift label ở config)
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/migrations/20260416153000_redeem_runtime_limits_indexes.sql`

## Build
- Đã build thử bằng Vite: **pass**
- `node_modules` và `dist` **không kèm trong file gửi**

## Lưu ý push / giải nén
- File zip gửi lần này **không có node_modules**
- File zip được đóng **phẳng ở root repo**, tránh lồng thêm 1 folder nữa khi giải nén/push
- Nếu repo đích đã có sẵn code, nên copy đè nội dung vào root repo hiện tại, không kéo nguyên folder con vào trong

## Việc bạn cần làm sau khi nhận file
1. Chạy migration mới trên Supabase.
2. Deploy lại function `server-app-runtime` nếu bạn đang dùng flow redeem runtime.
3. Vào tab Create Redeem test các case:
   - cùng gói
   - gói thấp hơn
   - gói cao hơn
   - credit âm
   - limit theo IP / device / account
