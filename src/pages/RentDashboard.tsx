import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { getFunction, postFunction } from "@/lib/functions";
import { useAuth } from "@/auth/AuthProvider";

type RentStatus = {
  ok: true;
  tenant_id: string;
  username: string;
  active: boolean;
  subscription_expires_at: string | null;
  rotate_count: number;
  tenant_secret: string;
};

export default function RentDashboardPage() {
  const { toast } = useToast();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [status, setStatus] = useState<RentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [activating, setActivating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await getFunction<RentStatus>("rent-status", { authToken: token });
      setStatus(res);
    } catch (err: any) {
      toast({ title: "Không tải được trạng thái", description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const expText = useMemo(() => {
    if (!status?.subscription_expires_at) return "Chưa kích hoạt";
    const ms = Date.parse(status.subscription_expires_at);
    if (!Number.isFinite(ms)) return status.subscription_expires_at;
    return new Date(ms).toLocaleString();
  }, [status]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Đã copy" });
    } catch {
      toast({ title: "Copy thất bại" });
    }
  };

  const onActivate = async () => {
    const c = code.trim();
    if (!c) return;
    if (!token) {
      toast({ title: "Chưa đăng nhập", description: "Vui lòng đăng nhập lại." });
      return;
    }
    setActivating(true);
    try {
      const res = await postFunction<{ ok: boolean; code?: string; msg?: string; subscription_expires_at?: string }>(
        "rent-activate",
        { code: c },
        { authToken: token },
      );
      if (!res.ok) {
        toast({ title: "Kích hoạt thất bại", description: res.msg ?? res.code ?? "Lỗi" });
        return;
      }
      toast({ title: "Kích hoạt thành công" });
      setCode("");
      await refresh();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err?.message ?? String(err) });
    } finally {
      setActivating(false);
    }
  };

  if (loading) return <div>Đang tải…</div>;
  if (!status) return <div>Không có dữ liệu.</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status.username}
            {status.active ? <Badge>Đang hoạt động</Badge> : <Badge variant="destructive">Chưa hoạt động</Badge>}
          </CardTitle>
          <CardDescription>Hết hạn: {expText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <div className="text-muted-foreground">Tenant ID</div>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all">{status.tenant_id}</code>
              <Button variant="outline" size="sm" onClick={() => copy(status.tenant_id)}>
                Copy
              </Button>
            </div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Tenant Secret (dùng để verify online)</div>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all">{status.tenant_secret}</code>
              <Button variant="outline" size="sm" onClick={() => copy(status.tenant_secret)}>
                Copy
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Giữ kín secret. Nếu lộ → báo admin rotate (rotate lần 2 trở đi bị trừ 20% thời gian còn lại).
            </div>
          </div>
        </CardContent>
      </Card>

      {!status.active && (
        <Card>
          <CardHeader>
            <CardTitle>Kích hoạt / gia hạn</CardTitle>
            <CardDescription>Nhập key gia hạn do admin cấp (ACT-...)</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ACT-XXXX-XXXX-..." />
            <Button onClick={onActivate} disabled={activating || !code.trim()}>
              {activating ? "Đang kích hoạt…" : "Kích hoạt"}
            </Button>
          </CardContent>
        </Card>
      )}

      {status.active && (
        <Card>
          <CardHeader>
            <CardTitle>Lưu ý</CardTitle>
            <CardDescription>
              Key khách (do bạn tạo) sẽ ngừng hoạt động nếu tenant hết hạn hoặc bạn rotate secret.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Rotate đã dùng: <b>{status.rotate_count}</b> lần
          </CardContent>
        </Card>
      )}
    </div>
  );
}
