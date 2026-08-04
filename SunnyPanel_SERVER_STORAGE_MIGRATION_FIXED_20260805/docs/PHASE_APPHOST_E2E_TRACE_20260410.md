# Phase end-to-end trace wiring - 2026-04-10

## Mục tiêu
Bật khả năng soi/truy dấu end-to-end cho nhánh Find Dumps từ free flow tới runtime.

## Những gì đã thêm
- `trace_id` xuyên suốt qua:
  - `licenses_free_sessions`
  - `licenses_free_gate_logs`
  - `licenses_free_security_logs`
  - `server_app_redeem_keys`
  - `server_app_sessions`
  - `server_app_wallet_transactions`
  - `server_app_runtime_events`
- `source_free_session_id` trên `server_app_redeem_keys`
- Free flow response (`free-start`, `free-gate`, `free-reveal`) giờ trả về `trace_id`
- Runtime redeem/consume trả và log lại `trace_id`
- Audit tab của Find Dumps đổi từ placeholder sang trace viewer thật

## Cách soi nhanh
1. User chạy free flow
2. Lấy `trace_id` từ màn claim/reveal hoặc runtime event
3. Mở tab Audit Log của Find Dumps
4. Dán trace id vào ô tra cứu
5. Xem các cụm:
   - Free sessions
   - Gate / reveal logs
   - Issued keys / redeem bridge
   - Runtime events
   - Security breadcrumbs

## Khi trace đứt giữa chừng
- Có session nhưng không có gate log: user chưa qua gate hoặc gate fail trước khi ghi claim
- Có gate log nhưng không có issued key: reveal fail hoặc quota/block
- Có redeem key nhưng không có runtime event: key chưa được redeem ở app/runtime
- Có runtime event lỗi: soi `code`, `message` và `meta` trong card Runtime events
