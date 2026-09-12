# SERVER PHASE 10 - CHARGE TAB HANDOVER - 2026-04-08

## Mục tiêu của lượt này
Lượt này **không đổi schema mới**. Schema phase 9 đã đủ cho credit debt, charge unit, quantity, guest visibility.
Việc chính của phase 10 là:

1. **Đưa toàn bộ rule charge / credit ra một tab riêng ở app-host**.
2. Để người vận hành chỉ cần vào:
   - domain app
   - menu 3 gạch
   - `Charge / Credit Rules`
3. Không phải nhớ rule đang nằm rải ở `config/features`, `config/wallet`, runtime hay detail cũ nữa.

---

## Những gì đã làm

### 1) Thêm tab mới trong workspace app-host
Đã thêm tab mới:
- `Charge / Credit Rules`

Vị trí:
- đứng giữa `Config` và `Trash`
- hiện ở cả sidebar desktop lẫn menu mobile

File sửa:
- `src/shell/AppWorkspaceShell.tsx`

### 2) Thêm route mới
Đã thêm route mới cho cả admin host và app host:
- `/admin/apps/:appCode/charge`
- `/apps/:appCode/charge`

File sửa:
- `src/App.tsx`

### 3) Mở rộng helper điều hướng workspace
Đã sửa helper để hỗ trợ thêm section `charge`.

File sửa:
- `src/lib/appWorkspace.ts`

### 4) Tạo page mới chuyên chỉnh charge
Đã tạo page mới:
- `src/pages/AdminServerAppCharge.tsx`

Trang này gom đúng 2 cụm:
- **Rule ví tổng**
- **Rule từng chức năng**

---

## Những field hiện đã chỉnh được trong Charge tab

### A. Rule ví tổng
Bảng nguồn:
- `server_app_wallet_rules`

Chỉnh được:
- `soft_wallet_label`
- `premium_wallet_label`
- `allow_decimal`
- `consume_priority`
- `soft_daily_reset_enabled`
- `premium_daily_reset_enabled`
- `soft_daily_reset_amount`
- `premium_daily_reset_amount`
- `soft_daily_reset_mode`
- `premium_daily_reset_mode`
- `soft_floor_credit`
- `premium_floor_credit`
- `soft_allow_negative`
- `premium_allow_negative`
- `notes`

### B. Rule từng feature
Bảng nguồn:
- `server_app_features`

Chỉnh được:
- `enabled`
- `requires_credit`
- `soft_cost`
- `premium_cost`
- `visible_to_guest`
- `charge_unit`
- `charge_on_success_only`
- `client_accumulate_units`
- `category`
- `group_key`
- `icon_key`

---

## Ý nghĩa vận hành của từng field quan trọng

### `charge_unit`
Số lần / số dòng / số đơn vị cần gom trước khi tính 1 lần charge.

Ví dụ:
- `1` = dùng một lần thì charge ngay
- `5` = đủ 5 dòng / 5 lần mới charge 1 lần

### `client_accumulate_units`
Cho phép app cộng dồn local trước rồi mới gửi consume lên server.

Ví dụ batch:
- 13 dòng
- `charge_unit = 5`
- app sẽ gửi `quantity = 2`
- giữ dư 3 dòng local chờ lượt sau

### `charge_on_success_only`
Chỉ trừ credit khi thao tác đã chạy xong thành công.
Phù hợp với:
- export
- export_json
- convert_image
- save file

### `visible_to_guest`
Cho khách nhìn thấy feature hay không.
- `true` = khách vẫn thấy tool
- `false` = chỉ user đã có session/login mới thấy

### `consume_priority`
Quy định dùng ví nào trước.
- `soft_first`
- `premium_first`

### `*_daily_reset_mode`
Hiện có 2 mode:
- `legacy_floor`
- `debt_floor`

#### `debt_floor`
Hợp với cơ chế bạn đang muốn:
- ví có thể âm
- đến ngày mới reset về floor mặc định
- nếu đang nợ thì ưu tiên trừ nợ trước

### `*_allow_negative`
Cho phép ví âm.
Nếu bật, thao tác vẫn có thể dùng tiếp rồi bù nợ sau.

### `*_floor_credit`
Mức floor mặc định mỗi ngày.
Ví dụ:
- floor = 5
- nếu số dư nhỏ hơn 5 thì kéo lên 5 theo mode reset
- nếu số dư lớn hơn 5 thì không reset

---

## Chỗ này KHÔNG phải lỗi nếu bạn không thấy field ở giao diện cũ
Nếu trước đây bạn không thấy các field như:
- `charge_unit`
- `visible_to_guest`
- `client_accumulate_units`
- `allow_negative`
- `floor_credit`

thì lý do là:
1. repo cũ chưa có phase 9, hoặc
2. schema phase 9 chưa chạy trên Supabase, hoặc
3. UI cũ chưa có tab riêng nên các field bị chôn trong config/detail cũ.

Lượt này giải quyết điểm số 3.

---

## Các file đã sửa trong lượt này

### UI route/navigation
- `src/App.tsx`
- `src/shell/AppWorkspaceShell.tsx`
- `src/lib/appWorkspace.ts`

### Trang mới
- `src/pages/AdminServerAppCharge.tsx`

### Ghi chú mới
- `SERVER_PHASE10_CHARGE_TAB_HANDOVER_20260408.md`
- `IMPORTANT_DOCS_INDEX_20260408.md`

---

## Không có migration mới ở lượt này
Lượt này **không thêm migration mới**.
Lý do:
- schema phase 9 đã đủ cho phần charge/debt/feature manifest
- phase 10 chỉ là dời phần vận hành lên một tab riêng để tiện dùng

Schema bắt buộc vẫn là migration này:
- `supabase/migrations/20260408103000_server_app_runtime_phase9_credit_debt_and_feature_manifest.sql`

Nếu chưa chạy migration này, tab Charge sẽ báo lỗi kiểu:
- thiếu cột `charge_unit`
- thiếu `visible_to_guest`
- thiếu `soft_floor_credit`
- thiếu `soft_allow_negative`

---

## Cách test nhanh sau khi deploy

### 1) Kiểm tra route mới
Mở:
- `/apps/find-dumps/charge`
- `/admin/apps/find-dumps/charge`

### 2) Kiểm tra hiển thị nav
Phải thấy đủ 4 mục:
- Runtime app
- Cấu hình app
- Charge / Credit Rules
- Trash

### 3) Kiểm tra save ví tổng
Sửa:
- consume priority
- soft floor
- premium floor
- allow negative

Bấm `Lưu ví tổng`

Kỳ vọng:
- toast thành công
- refresh lại vẫn giữ giá trị vừa lưu

### 4) Kiểm tra save feature
Sửa feature `batch_search`:
- `charge_unit = 5`
- `client_accumulate_units = true`
- `soft_cost = 1`
- `premium_cost = 1`

Bấm `Lưu feature rules`

Kỳ vọng:
- lưu thành công
- reload lại vẫn giữ rule

---

## Cách khớp với app sau này
Đây là những field app nên đọc và dùng trực tiếp:

### Batch search
- `charge_unit`
- `client_accumulate_units`
- `charge_on_success_only`

### Export / Export JSON
- `charge_on_success_only = true`
- chỉ trừ sau khi export file thành công

### Convert image
- chỉ trừ ở thao tác save/export cuối

### Encode / Decode
- có thể để free hoặc charge sau save/export nếu bạn muốn

### Hex edit
- hợp nhất là chỉ trừ ở lúc `save file`
- không trừ ngay khi mới mở editor

---

## Những gì còn dang dở sau lượt này
1. **App chưa đọc full end-to-end tất cả feature rule mới**.
   - Server đã có
   - Charge tab đã chỉnh được
   - App vẫn cần nối nốt cho từng tool

2. **AdminServerAppDetail.tsx vẫn còn giữ một phần field cũ**.
   - không sai
   - nhưng tab `Charge / Credit Rules` mới là chỗ dùng chính

3. **Chưa có migration phase 10 riêng** vì không cần thêm schema.

---

## Khuyến nghị vận hành
- Từ giờ về sau, mọi thứ liên quan đến:
  - giá credit
  - nợ credit
  - số lần dùng mới trừ
  - guest visibility
  - ưu tiên ví
  hãy chỉnh trong **tab Charge / Credit Rules** trước.

- `Config` nên để cho metadata và cấu hình app chung.
- `Runtime` dùng để xem phiên và test luồng runtime.
- `Trash` dùng cho session/trạng thái bị revoke/delete.

---

## Nếu tab Charge báo lỗi khi lưu
### Trường hợp 1: thiếu cột
Nguyên nhân:
- chưa chạy migration phase 9

Cách fix:
1. chạy migration `20260408103000_server_app_runtime_phase9_credit_debt_and_feature_manifest.sql`
2. deploy lại function runtime nếu cần
3. reload lại tab Charge

### Trường hợp 2: UI lưu xong không đổi
Nguyên nhân thường gặp:
- đang nhìn nhầm app code
- onConflict chưa trúng cặp khóa
- schema live khác repo local

Cách check:
- xác nhận `app_code`
- xác nhận bảng live có cột phase 9
- reload lại data từ tab Charge

---

## Ghi nhớ quan trọng
Tab này được tạo ra để giải quyết đúng vấn đề bạn nêu:
- không phải chỉnh nhiều nơi
- không phải nhớ chỗ field bị chôn trong config/detail
- mọi thứ về credit / charge rule / debt rule nằm tập trung trong app-host

