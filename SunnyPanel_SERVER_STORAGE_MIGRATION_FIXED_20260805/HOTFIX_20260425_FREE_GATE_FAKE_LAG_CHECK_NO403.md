# HOTFIX 2026-04-25 — Free gate + Fake Lag check no-403

Mục tiêu:
- Dừng lỗi Edge Function trả HTTP 403/426 làm app/web hiểu nhầm là backend/service unavailable.
- Giữ nguyên logic chặn trong JSON (`ok:false`, `decision`, `code`, `hard_blocked`) nhưng không dùng HTTP 403 cho lỗi luồng người dùng.
- Sửa audit fake-lag-auth ghi đúng schema hiện tại của `server_app_version_audit_logs` (`decision`, `code`, `meta`) thay vì cột cũ không tồn tại (`allowed`, `reason`, ...).
- Thêm lại source `free-gate` vào repo để deploy đồng bộ, tránh dùng function cũ đang trả 400/403.

Đã sửa:
1. `supabase/functions/fake-lag-check/index.ts`
   - Block/update vẫn có code rõ ràng nhưng HTTP trả 200.
   - Thêm `http_status_hint` để audit vẫn biết ban đầu đáng lẽ là 403/426.
2. `supabase/functions/fake-lag-auth/index.ts`
   - Audit schema-safe theo bảng hiện tại.
3. `supabase/functions/free-gate/index.ts`
   - Public gate hotfix.
   - User-flow deny trả 200 `{ ok:false, code, msg }`.
   - Check session/out_token/fingerprint/ip/ua/min-delay/double-gate/claim.
4. `src/lib/functions.ts`
   - Frontend không ném generic error khi public function cũ vẫn trả 400/403 kèm body `{ok:false}`.

Deploy đúng project đang lỗi trong ảnh:
```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase functions deploy fake-lag-check --no-verify-jwt
npx supabase functions deploy fake-lag-auth --no-verify-jwt
npx supabase functions deploy free-gate --no-verify-jwt
```

Nếu web panel dùng build tĩnh, build/deploy lại web sau khi update để nhận `src/lib/functions.ts`.

Lưu ý:
- Các invocation 403 cũ trong dashboard sẽ không mất.
- Sau deploy, lỗi chặn hợp lệ sẽ thành 200 + JSON code rõ ràng.
- Nếu còn 403 mới thì kiểm tra Settings của function có đang bật Verify JWT hoặc deploy nhầm project.
