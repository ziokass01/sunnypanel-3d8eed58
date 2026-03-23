import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function ServiceLandingPage() {
  const nav = useNavigate();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">mityangho.id.vn</h1>
        <p className="text-sm text-muted-foreground">Chọn dịch vụ bạn muốn dùng.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Thuê Website</CardTitle>
            <CardDescription>Đăng nhập tài khoản thuê và quản lý key riêng của bạn.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => nav("/rent")}>Vào trang thuê</Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Key Free</CardTitle>
            <CardDescription>Lấy key free và đi qua flow Gate/Claim như bình thường.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="soft" onClick={() => nav("/free")}>Vào Key Free</Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Reset Key</CardTitle>
            <CardDescription>Kiểm tra hạn key, xem loại key và reset thiết bị trực tiếp cho người dùng.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="soft" onClick={() => nav("/reset-key")}>Vào Reset Key</Button>
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        Lưu ý: Free, Rent và Reset Key dùng các flow riêng để tránh đụng hệ thống đang chạy.
      </div>
    </div>
  );
}
