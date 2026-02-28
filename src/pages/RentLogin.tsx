import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export default function RentLoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const email = useMemo(() => `${username.trim()}@tenant.local`, [username]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || !password) {
      toast({ title: "Thiếu thông tin", description: "Nhập username + mật khẩu" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        toast({ title: "Đăng nhập thất bại", description: error.message });
        return;
      }
      navigate("/rent", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Đăng nhập thuê website</CardTitle>
          <CardDescription>Username do admin cấp. Không dùng email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm">Username</div>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="vd: shopA" autoCapitalize="none" />
            </div>
            <div className="space-y-1">
              <div className="text-sm">Mật khẩu</div>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="truncate">Email nội bộ: {email}</div>
            </div>
            <div className="text-sm">
              Quên mật khẩu?{" "}
              <Link to="/reset-password" className="underline">
                Đổi bằng code
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
