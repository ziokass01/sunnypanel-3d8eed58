# FIX NOTE 2026-04-17 · Redeem tabs + mixed wallet consume + RPC ambiguous fix

## Đã sửa

### 1) Logic trừ ví soft / vip kiểu bù chéo
- Khi feature có cả `soft_cost` và `premium_cost`, runtime không còn bắt cứng từng ví phải đủ tuyệt đối.
- Nếu soft thiếu nhưng vip còn, vip sẽ bù phần soft thiếu theo đúng tỷ lệ cost của feature.
- Nếu vip thiếu nhưng soft còn, soft cũng có thể bù ngược theo tỷ lệ tương ứng.
- Ví dụ feature tốn `1.8 soft + 0.1 vip`:
  - soft còn `0.2`
  - vip còn `1.0`
  - hệ thống sẽ trừ hết `0.2 soft`
  - phần thiếu `1.6 soft` sẽ đổi sang vip theo tỷ lệ `1.8 : 0.1`
  - vip bị trừ thêm khoảng `0.0889`
  - tổng vip bị trừ khoảng `0.1889`

### 2) Fix lỗi redeem RPC `redeemed_count is ambiguous`
- Thêm migration mới để thay hàm `server_app_reserve_redeem_use`.
- Đổi output `redeemed_count` thành `next_redeemed_count` để tránh đụng tên biến PL/pgSQL.
- Runtime đọc cả `next_redeemed_count` lẫn fallback cũ để an toàn.

### 3) Sửa UI Create Redeem đúng ý
- Không còn kéo dài một tab danh sách lẫn lộn.
- Dùng 3 tab:
  - `Chỉnh mã`
  - `Redeem admin`
  - `Redeem free`
- `Thông tin mã + Giới hạn + Phần thưởng & logic` được gộp lại trong tab `Chỉnh mã`.
- Hai tab còn lại thay bằng danh sách `Redeem admin` và `Redeem free`.

### 4) Thêm nút Edit rõ ràng
- Trong từng item danh sách redeem có nút `Edit` riêng.
- Không còn bắt phải bấm vào cả card để chọn rồi mới chỉnh.

### 5) Ẩn phần thừa
- Bỏ `Checklist UI bước cuối`.
- Bỏ `Preview logic`.

## File chính đã sửa
- `src/pages/AdminServerAppRedeem.tsx`
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/functions/server_app_runtime.ts`
- `supabase/migrations/20260417103000_redeem_rpc_ambiguous_fix_v2.sql`

## Việc phải làm sau khi lấy repo này
1. Chạy migration mới.
2. Deploy lại function `server-app-runtime`.
3. Test lại redeem mixed wallet và các limit.
