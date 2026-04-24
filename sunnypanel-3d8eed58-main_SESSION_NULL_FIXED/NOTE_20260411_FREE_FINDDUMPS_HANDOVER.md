# NOTE 2026-04-11 · FREE + FIND DUMPS HANDOVER

## Hôm nay đã gặp gì

1. Trang `/free/gate` bị trắng vì `FreeGate.tsx` từng bị vá chồng 2 bản hàm vào cùng một file.
2. Trang `/free/gate/claim` từng 404 vì route/flow claim không đồng bộ với gate.
3. `AdminServerAppKeys.tsx` từng thiếu `soft_credit_amount` và `premium_credit_amount` ở package payload nên lưu `Server key` nổ `not-null constraint`.
4. Project thật cần dùng là `uvqgpgkaxpiczasfwzgm`, không phải project ref cũ.

## Đã fix trong ngày

- Khôi phục gate/claim bằng bản sạch và đồng bộ lại flow FREE.
- Giữ payload an toàn cho `server_app_reward_packages` để package rows luôn có `soft_credit_amount = 0` và `premium_credit_amount = 0`.
- Ẩn khối lớn `Nhánh riêng cho Find Dumps` ở `/free`, thay bằng box nhỏ hiển thị tên key và quota theo key/app đang chọn.
- Mở nhập số thập phân ổn định trên mobile ở trang cấu hình app Find Dumps bằng `inputMode="decimal"` và chuẩn hóa `,` thành `.`.

## Lưu ý cực quan trọng

1. Không chép lại file `FreeGate.tsx` hoặc `FreeClaim.tsx` từ đoạn chat/commit cũ nếu chưa kiểm tra toàn bộ file. Hai file này rất dễ gãy khi dính vá chồng.
2. Không dùng lại bản `AdminServerAppKeys.tsx` thiếu 2 field credit của package payload. Chỉ cần thiếu 1 lần là `server_app_reward_packages` sẽ nổ not-null ngay.
3. Khi đổi flow free, phải xem cùng lúc 4 điểm: `FreeLanding.tsx`, `FreeGate.tsx`, `FreeClaim.tsx`, `src/lib/freeFlow.ts`. Không sửa lẻ từng file.
4. Với Find Dumps, ưu tiên cấu trúc mở: map theo `app_code`, tránh hard-code đóng để sau này thêm app mới không gãy layout và logic.
5. Sau khi sửa frontend, luôn build và redeploy web host. Chỉ deploy Supabase thì không cập nhật được lỗi giao diện.

## Chỗ vừa chỉnh thêm

- `/free`:
  - Ẩn box lớn `Nhánh riêng cho Find Dumps`.
  - Thêm box nhỏ dưới `Thiết bị hiện tại` để hiện tên key theo app và quota thiết bị/IP theo key hiện tại.
- `AdminServerAppDetail.tsx`:
  - Các ô decimal ở Plans, Features, Wallet, Rewards đều hỗ trợ gõ số thập phân trên mobile.

## Nên test lại

1. `/free` với key Free Fire và Find Dumps xem box tên key đổi đúng chưa.
2. `/free` xem giới hạn thiết bị/IP đổi theo app hiện tại chưa.
3. `Admin > Apps > Find Dumps > Cấu hình` thử gõ `1.5`, `0.45`, `2,75` vào các ô decimal và bấm lưu.
4. Test lại `Get Key` cho cả Free Fire và Find Dumps sau mỗi lần sửa flow FREE.
