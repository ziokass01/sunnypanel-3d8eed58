# IMPORTANT DOCS INDEX - 2026-04-08

## Tài liệu phải giữ lại

### 1. Tổng handover kỹ thuật
- `SUNNYMOD_FULL_TECHNICAL_HANDOVER_20260408.md`

Dùng khi cần nhìn toàn cảnh app + server + lỗi đã gặp.

### 2. Kế hoạch credit debt server
- `SERVER_CREDIT_DEBT_PLAN_20260408.md`

Dùng khi cần nhớ logic:
- cho âm credit
- reset về floor
- ưu tiên ví thường trước, VIP sau
- quantity consume

### 3. Phase 10 charge tab
- `SERVER_PHASE10_CHARGE_TAB_HANDOVER_20260408.md`

Dùng khi cần nhớ:
- tab Charge nằm ở đâu
- field nào chỉnh được
- test như nào
- lỗi nào xuất hiện nếu schema phase 9 chưa chạy

### 4. JWT runtime lỗi 401
- `JWT_401_RUNTIME_OPS_DETAILED_REPORT_20260406.md`
- `FIX_REPORT_20260407_JWT_REFRESH.md`
- `FIX_REPORT_20260407_JWT_RETRY_V2.md`
- `FIX_REPORT_20260407_ROUTE_RESET.md`

Dùng khi bị:
- invalid jwt
- 401 ở runtime ops
- loop admin/app

### 5. App encode/json/image/background
- `FIX_NOTE_20260408_ENCODE_JSON_BACKGROUND.md`
- `MD_NOTES_20260408.md`

Dùng khi cần nhớ:
- export json
- encode/decode
- convert image
- background notify
- AIDE compile issues

## Khuyến nghị lưu trữ
- luôn giữ bản trong repo root
- giữ thêm 1 bản ngoài repo để khi đổi chat vẫn còn tài liệu
- khi sửa xong phase mới thì thêm tiếp 1 file handover riêng, không ghi đè file cũ

## Quy tắc đặt tên khuyên dùng
- `SERVER_PHASE##_TEN_NOI_DUNG_YYYYMMDD.md`
- `APP_PHASE##_TEN_NOI_DUNG_YYYYMMDD.md`
- `FIX_NOTE_YYYYMMDD_TOPIC.md`
- `HANDOVER_YYYYMMDD.md`

