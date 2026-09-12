export function RentApiQuickNotes() {
  const requestFields = [
    ["username", "Tên tài khoản thuê dùng để verify key."],
    ["key", "Key cần kiểm tra theo format XXXX-XXXX-XXXX-XXXX."],
    ["device_id", "Mã máy hoặc mã thiết bị. Nên cố định theo từng máy để tránh lệch thiết bị."],
    ["ts", "Unix timestamp theo giây. Luôn lấy thời gian hiện tại khi gửi request."],
    ["sig_user", "HMAC SHA256 của chuỗi username|key|device_id|ts bằng user_hmac_secret."],
  ] as const;

  const errors = [
    ["VALID", "Key hợp lệ."],
    ["KEY_NOT_FOUND", "Không tìm thấy key."],
    ["BAD_SIGNATURE", "Sai chữ ký sig_user."],
    ["BAD_TIMESTAMP", "Timestamp lệch hoặc quá cũ."],
    ["KEY_DISABLED", "Key đang bị tắt."],
    ["KEY_EXPIRED", "Key đã hết hạn."],
    ["DEVICE_LIMIT", "Vượt quá số thiết bị cho phép."],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="font-medium text-slate-950">Tích hợp an toàn</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Luồng khuyến nghị</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">HTML hoặc app gửi request verify. Web public nên đi qua worker hoặc proxy để không lộ secret.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Device ID</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">Giữ cố định theo từng máy. Đổi lung tung sẽ dễ chạm giới hạn thiết bị.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Timestamp</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">Gửi theo giây và lấy từ thời gian hiện tại để tránh BAD_TIMESTAMP.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Bảo mật</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">Không đưa master secret lên client. Không nhét user secret vào HTML public.</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="font-medium text-slate-950">Ý nghĩa từng field</div>
        <div className="mt-4 grid gap-3">
          {requestFields.map(([field, desc]) => (
            <div key={field} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[140px_minmax(0,1fr)]">
              <div className="font-mono text-xs text-slate-800">{field}</div>
              <div className="text-sm leading-6 text-slate-600">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="font-medium text-slate-950">Mã lỗi thường gặp</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {errors.map(([code, desc]) => (
            <div key={code} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-mono text-xs text-slate-800">{code}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
        <div className="font-medium text-amber-950">Những gì có thể cấp cho người dùng</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-900">
          <li>Verify URL, username, JSON mẫu, mã lỗi và file hỗ trợ CA/libcurl.</li>
          <li>HMAC chỉ mở khi user chủ động xem và có lớp khóa bảo vệ.</li>
          <li>Không cấp master secret, service role, SQL quản trị hoặc secret của khách khác.</li>
          <li>Nếu nghi lộ secret, hãy rotate HMAC rồi cập nhật lại phía tích hợp.</li>
        </ul>
      </div>
    </div>
  );
}
