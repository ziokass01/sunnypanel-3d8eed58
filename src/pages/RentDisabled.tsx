import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

export function RentDisabledPage() {
  const navigate = useNavigate();

  return (
    <div className="page-wrap flex min-h-[100dvh] max-w-3xl items-center py-10">
      <Card className="w-full border-amber-200/70 shadow-sm">
        <CardHeader>
          <CardTitle>Thuê Website đang tạm đóng</CardTitle>
          <CardDescription>
            Khu vực Rent hiện không sử dụng và đã được tắt để giảm tải hệ thống.
            Trang này không gọi API Rent và không truy cập dữ liệu Rent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => navigate("/")}>Về trang chính</Button>
          <Button variant="soft" onClick={() => navigate("/free")}>Vào Key Free</Button>
        </CardContent>
      </Card>
    </div>
  );
}
