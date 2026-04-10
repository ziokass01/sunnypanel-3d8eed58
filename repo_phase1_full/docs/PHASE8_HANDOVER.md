# Phase 8 handover

Đợt này tập trung vào khu điều hành riêng cho từng app và dọn UX/runtime admin trước khi nối app thật.

## Tệp đã sửa
- `src/pages/AdminServerAppRuntime.tsx`
- `docs/PHASE8_HANDOVER.md`

## Những gì đã làm
- Biến runtime admin thành một **app workspace** rõ ràng hơn cho riêng app đang mở.
- Thêm **ô tìm kiếm toàn cục** để lọc nhanh account, device, redeem key, feature, transaction và event.
- Thêm **mở lại** cho:
  - entitlement đã revoke
  - session đã revoke
- Sửa UX redeem key:
  - nếu chọn **reward mode = package** thì key sẽ lấy reward từ package
  - nếu chuyển sang các mode khác thì khi lưu sẽ **bỏ liên kết package** để credit/plan/ngày trên key có hiệu lực
- Ghi chú rõ nguồn reward ngay trong từng redeem key:
  - đang lấy từ package
  - hay đang lấy trực tiếp từ key
- Cải thiện thông báo lỗi ở simulator/ops:
  - hiển thị message dễ hiểu hơn cho các mã lỗi phổ biến như `REDEEM_KEY_NOT_FOUND`, `MISSING_SESSION_TOKEN`, `MISSING_FEATURE_CODE`, `INSUFFICIENT_PREMIUM_BALANCE`, ...
- Thêm gợi ý cách dùng đúng cho từng action simulator.
- Thêm danh sách gợi ý `feature_code` trong simulator bằng datalist.

## Điều chưa đổi trong phase này
- Chưa thêm route mới riêng ngoài `/admin/apps/:appCode/runtime` vì route này vốn đã là trang riêng. Đợt này tập trung làm nó thành workspace rộng và dễ dùng hơn.
- Chưa đổi backend function/schema.

## Sau khi chép patch
Chỉ cần build/deploy **frontend admin** lại. Không cần deploy function hay migration cho patch này.

## Cách test nhanh
1. Vào runtime page của app.
2. Gõ từ khóa vào ô tìm kiếm, kiểm tra entitlements / wallets / sessions / events có lọc.
3. Thử `Revoke` rồi `Mở lại` entitlement.
4. Thử `Revoke session` rồi `Mở lại` session.
5. Ở redeem key:
   - chọn package và lưu, kiểm tra dòng mô tả báo đang lấy reward từ package
   - đổi sang `mixed` rồi lưu, kiểm tra package bị bỏ và key dùng credit gõ trực tiếp
6. Chạy simulator với một lỗi cố ý, ví dụ `consume` không có `session_token`, rồi kiểm tra phần trạng thái và JSON hiển thị lỗi rõ hơn.
