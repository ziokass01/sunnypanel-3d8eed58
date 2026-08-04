# Phase 4 deploy notes

## Vì sao web chưa đổi dù repo đã push
- Frontend hosting có thể vẫn đang cache bản build cũ
- Hoặc deployment chưa kéo đúng commit mới nhất từ `main`
- Với public domain `mityangho.id.vn`, hãy redeploy frontend rồi hard refresh trình duyệt

## Cần test lại sau deploy
1. Trang chủ public phải có 3 card: Thuê Website / Key Free / Reset Key
2. Trang Reset Key phải có popup xác nhận trước khi reset
3. Admin sidebar phải có Reset Settings và Reset Logs
4. Reset Logs phải lọc được theo action và key
