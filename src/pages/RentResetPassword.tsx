import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { postFunction } from "@/lib/functions";

export default function RentResetPasswordPage() {
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || !code || !newPassword) {
      toast({ title: "Thiếu thông tin", description: "Nhập username, code và mật khẩu mới" });
      return;
    }
    if (newPassword !== confirm) {
      toast({ title: "Mật khẩu không khớp" });
      return;
    }

    setLoading(true);
    try {
      const res = await postFunction<{ ok: boolean; code?: string; msg?: string }>("rent-reset-password", {
        username: u,
        code,
        new_password: newPassword,
      });

      if (!res.ok) {
        toast({ title: "Đổi mật khẩu thất bại", description: res.msg ?? res.code ?? "Lỗi" });
        return;
      }

      toast({ title: "Đổi mật khẩu thành công", description: "Bạn có thể quay lại đăng nhập" });
      setCode("");
      setNewPassword("");
      setConfirm("");
    } catch (err: any) {
      toast({ title: "Lỗi", description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Đổi mật khẩu bằng code</CardTitle>
          <CardDescription>Admin sẽ cấp code 1 lần. Dùng xong là hết hạn.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm">Username</div>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="vd: shopA" autoCapitalize="none" />
            </div>
            <div className="space-y-1">
              <div className="text-sm">Reset code</div>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RST-XXXX-XXXX-..." autoCapitalize="characters" />
            </div>
            <div className="space-y-1">
              <div className="text-sm">Mật khẩu mới</div>
              <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" />
            </div>
            <div className="space-y-1">
              <div className="text-sm">Nhập lại</div>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Đang xử lý…" : "Đổi mật khẩu"}
            </Button>
            <div className="text-sm">
              <Link to="/login" className="underline">
                Quay lại đăng nhập
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
