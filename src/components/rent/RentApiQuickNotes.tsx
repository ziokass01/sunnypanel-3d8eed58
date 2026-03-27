export function RentApiQuickNotes() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="font-medium text-slate-950">Tích hợp an toàn</div>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
        <li>Dùng đúng verify URL và username của tài khoản thuê.</li>
        <li>Giữ device_id cố định theo từng máy để tránh lệch thiết bị.</li>
        <li>Timestamp nên gửi theo giây và luôn lấy thời gian hiện tại.</li>
        <li>Web public nên dùng worker hoặc proxy thay vì giữ secret trực tiếp.</li>
      </ul>
    </div>
  );
}
