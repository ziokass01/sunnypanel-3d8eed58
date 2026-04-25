import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function ServiceLandingPage() {
  const nav = useNavigate();

  return (
    <div className="page-wrap max-w-6xl space-y-8 py-8">
      <section className="panel-shell overflow-hidden p-8 sm:p-10">
        <div className="mb-8 flex items-start gap-4">
          <img
            src="/android-chrome-512x512.png"
            alt="SUNNY"
            className="h-14 w-14 rounded-[1.2rem] object-cover shadow-[0_14px_26px_-18px_rgba(15,23,42,0.35)]"
          />
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">mityangho.id.vn</h1>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-500">
              Chọn đúng khu vực bạn cần dùng. Mỗi mục giữ flow riêng để không ảnh hưởng hệ thống đang chạy.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle>Thuê Website</CardTitle>
              <CardDescription>Đăng nhập tài khoản thuê và quản lý key riêng của bạn trong giao diện sáng, dễ nhìn.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => nav("/rent")}>Vào trang thuê</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key Free</CardTitle>
              <CardDescription>Vào khu lấy Key 🔑 Free, nhận Key 🔑 và tải MENU 🕹 hỗ trợ đi kèm.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="soft" onClick={() => nav("/free")}>Vào Key Free</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reset Key</CardTitle>
              <CardDescription>Kiểm tra hạn key, xem loại key và reset thiết bị/lượt dùng cho Free Fire, Find Dumps và Fake Lag.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="soft" onClick={() => nav("/reset-key")}>Vào Reset Key</Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <p className="px-2 text-sm text-slate-500">
        Lưu ý: Free, Rent và Reset Key dùng các flow riêng để tránh đụng hệ thống đang chạy. Trang Fake Lag không hiển thị ở màn hình chính public.
      </p>
    </div>
  );
}
