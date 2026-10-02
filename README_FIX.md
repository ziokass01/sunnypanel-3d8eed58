# Fix allowlist Support Member

Nguyên nhân: migration 20261002040000_support_member.sql đã được thêm nhưng phiên bản 20261002040000 chưa có trong allowlist deploy. Script dừng exit 4 trước db push.

Chép đúng 4 file trong ZIP vào repository, giữ nguyên đường dẫn (bao gồm thư mục .github), rồi commit/push lên main. Dùng run mới tạo từ commit mới; nút Re-run jobs trên run cũ vẫn dùng commit cũ và sẽ lỗi lại.

Không cần sửa SQL, secret, WAF, VPS hoặc giao diện. Không bỏ guard/allowlist, không dùng --include-all hay migration repair để né lỗi.

Workflow supabase-functions.yml hiện tự chạy khi push main. Sau khi migration thành công, workflow sẽ tiếp tục bước cấu hình secrets và deploy các Edge Functions như cơ chế cũ. Bản vá không thay đổi các bước đó. Theo dõi run đến cuối; chưa thể cam kết các bước sau sẽ thành công chỉ từ log lỗi allowlist này.

Kiểm tra local: bash -n hai script; kiểm tra cả bốn allowlist chỉ thêm đúng phiên bản mới; guard chạy với CLI giả lập chấp nhận migration Support Member, vẫn từ chối migration chưa allowlist/remote-only/lịch sử cũ. Chưa chạy GitHub Actions hoặc database production.

Rollback bốn file về commit trước nếu cần. Rollback allowlist không tự rollback SQL đã được áp dụng.
