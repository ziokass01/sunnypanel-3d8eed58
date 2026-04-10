# Phase 7 runtime UI fix check

Đã vá giao diện tab Simulator và Ops trong `src/pages/AdminServerAppRuntime.tsx`.

Các điểm sửa:
- thêm `health` vào dropdown action
- thêm `formatJsonBlock` để tránh lỗi compile khi format JSON
- thêm ô trạng thái simulator
- thêm ô payload simulator
- thêm ô trạng thái ops
- thêm ô payload ops
- reset form sẽ xóa luôn trạng thái/payload cũ

Sau khi deploy frontend, tab Simulator phải thấy ngay:
- action `health`
- khối `Trạng thái simulator`
- khối `Payload vừa gửi`
- khối `Kết quả JSON`
