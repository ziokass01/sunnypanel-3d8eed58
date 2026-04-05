import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const APP_META: Record<string, { label: string; description: string }> = {
  "find-dumps": {
    label: "Find Dumps",
    description: "Bảng điều khiển riêng cho Find Dumps, tách khỏi admin tổng để dễ nhìn và tránh nhầm trang.",
  },
  "free-fire": {
    label: "Free Fire",
    description: "Bảng điều khiển riêng cho Free Fire, vẫn trực thuộc quyền admin hiện tại.",
  },
};

function fallbackMeta(appCode: string) {
  return APP_META[appCode] ?? {
    label: appCode || "Server app",
    description: "Workspace riêng của app này.",
  };
}

export function AppWorkspaceDashboardPage() {
  const { appCode = "" } = useParams();
  const meta = fallbackMeta(appCode);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["app-workspace-dashboard", appCode],
    enabled: Boolean(appCode),
    queryFn: async () => {
      const sb = supabase as any;
      const [appRes, redeemRes, entitlementRes, walletRes, sessionRes, eventRes] = await Promise.all([
        sb.from("server_apps").select("label,description,admin_url,public_enabled").eq("code", appCode).maybeSingle(),
        sb.from("server_app_redeem_keys").select("id", { count: "exact", head: true }).eq("app_code", appCode),
        sb.from("server_app_entitlements").select("id", { count: "exact", head: true }).eq("app_code", appCode),
        sb.from("server_app_wallet_balances").select("id", { count: "exact", head: true }).eq("app_code", appCode),
        sb.from("server_app_sessions").select("id", { count: "exact", head: true }).eq("app_code", appCode),
        sb.from("server_app_runtime_events").select("id", { count: "exact", head: true }).eq("app_code", appCode),
      ]);

      const firstError = [appRes, redeemRes, entitlementRes, walletRes, sessionRes, eventRes].find((item) => item.error)?.error;
      if (firstError) throw firstError;

      return {
        app: appRes.data,
        counts: {
          redeem: Number(redeemRes.count ?? 0),
          entitlements: Number(entitlementRes.count ?? 0),
          wallets: Number(walletRes.count ?? 0),
          sessions: Number(sessionRes.count ?? 0),
          events: Number(eventRes.count ?? 0),
        },
      };
    },
  });

  const appLabel = data?.app?.label || meta.label;
  const appDescription = data?.app?.description || meta.description;

  return (
    <section className="space-y-4">
      <Card className="rounded-[32px]">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-3xl">{appLabel}</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
                {appDescription}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={data?.app?.public_enabled ? "secondary" : "outline"}>
                {data?.app?.public_enabled ? "Đang bật" : "Đang ẩn"}
              </Badge>
              <Button variant="outline" onClick={() => refetch()}>Làm mới</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-5">
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Redeem keys</div><div className="mt-2 text-3xl font-semibold">{data?.counts.redeem ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Entitlements</div><div className="mt-2 text-3xl font-semibold">{data?.counts.entitlements ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Wallets</div><div className="mt-2 text-3xl font-semibold">{data?.counts.wallets ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Sessions</div><div className="mt-2 text-3xl font-semibold">{data?.counts.sessions ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Events</div><div className="mt-2 text-3xl font-semibold">{data?.counts.events ?? 0}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Cấu hình nội bộ</CardTitle>
            <CardDescription>
              Chỉnh app settings, plans & credit, feature flags, wallet rules và reward/redeem theo layout riêng của app này.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              Khu này dành cho cấu hình nội bộ. Không đổi quyền admin, chỉ tách giao diện khỏi admin tổng để dễ tập trung.
            </div>
            <Button asChild><Link to={`/apps/${appCode}/internal`}>Mở cấu hình nội bộ</Link></Button>
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Runtime admin</CardTitle>
            <CardDescription>
              Vào thẳng simulator, redeem keys, entitlements, wallets, sessions, transactions và runtime events của app này.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              Đây là khu theo dõi account, log và xử lý runtime theo app, thay vì dồn chung vào một trang admin bé và dễ nhầm.
            </div>
            <Button asChild><Link to={`/apps/${appCode}/runtime`}>Mở runtime admin</Link></Button>
          </CardContent>
        </Card>
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Đang tải dashboard app...</div> : null}
    </section>
  );
}
