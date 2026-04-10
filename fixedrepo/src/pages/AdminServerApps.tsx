import { ArrowUpRight, AppWindow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAppWorkspaceUrl } from "@/lib/appWorkspace";
import { getServerAppMeta } from "@/lib/serverAppPolicies";

const APPS = [getServerAppMeta("free-fire"), getServerAppMeta("find-dumps")] as const;

export function AdminServerAppsPage() {
  const openTarget = (url: string) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(url);
  };

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Server app</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Free Fire giữ nguyên nhánh legacy đang chạy ổn. Find Dumps dùng app-host mới để tách riêng cấu hình app, runtime, server key, charge / credit rules, audit log và trash.
            </p>
          </div>
          <Badge variant="outline">Legacy + App-host</Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {APPS.map((app) => (
          <Card key={app.code} className="overflow-hidden rounded-[28px] border-slate-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <div className="h-1.5 bg-[linear-gradient(90deg,#0f172a_0%,#334155_40%,#fbbf24_100%)]" />
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{app.label}</CardTitle>
                <Badge variant={app.mode === "legacy" ? "secondary" : "outline"}>{app.mode === "legacy" ? "Legacy" : "App-host"}</Badge>
              </div>
              <CardDescription>{app.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/20 p-3 text-xs text-muted-foreground break-all">Điểm vào: {app.serverUrl}</div>
              {app.code === "free-fire" ? (
                <Button className="w-full" onClick={() => openTarget(app.serverUrl)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Server
                </Button>
              ) : (
                <div className="grid gap-2">
                  <Button className="w-full" onClick={() => openTarget(buildAppWorkspaceUrl("find-dumps", "keys"))}>
                    <AppWindow className="mr-2 h-4 w-4" />
                    Server
                  </Button>
                  <div className="rounded-2xl border bg-slate-50 p-3 text-xs text-slate-600">Find Dumps mở thẳng vào khu Server key. Runtime, Charge / Credit Rules, Audit Log và Trash nằm trong menu app-host để không trộn lẫn với nhánh Free Fire.</div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
