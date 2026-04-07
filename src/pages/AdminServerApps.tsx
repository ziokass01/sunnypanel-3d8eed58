import { ArrowUpRight, Cog, PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAdminAppUrl, getAdminOrigin } from "@/lib/appWorkspace";

const APPS = [
  {
    code: "free-fire",
    label: "Free Fire",
    description: "Server web hiện tại cho app Free Fire. Dùng để quản lý free key, luồng vượt và các gói mở rộng sau này.",
    url: (import.meta.env.VITE_SERVER_APP_FREE_FIRE_URL as string | undefined)?.trim() || "/admin/free-keys?app=free-fire",
    mode: "current",
  },
  {
    code: "find-dumps",
    label: "Find Dumps",
    description: "Server web dành cho app Find Dumps. Tại đây bạn có thể chuẩn bị cấu hình gói, credit và feature flags riêng cho app này.",
    url: (import.meta.env.VITE_SERVER_APP_FIND_DUMPS_URL as string | undefined)?.trim() || "/admin/free-keys?app=find-dumps",
    mode: "new",
  },
] as const;

export function AdminServerAppsPage() {
  const adminOrigin = getAdminOrigin();

  const openTarget = (url: string) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(url);
  };

  const openWorkspaceSection = (appCode: string, section: "config" | "runtime") => {
    window.location.assign(buildAdminAppUrl(appCode, section));
  };

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Server app</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Luồng server app hiện được giữ gọn trong admin để tránh loop giữa nhiều domain. Bấm <span className="font-medium text-foreground">Cấu hình app</span> hoặc <span className="font-medium text-foreground">Runtime app</span> sẽ đi thẳng vào đường dẫn quản trị ổn định.
            </p>
          </div>
          <Badge variant="outline">{adminOrigin}</Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {APPS.map((app) => (
          <Card key={app.code} className="overflow-hidden rounded-[28px] border-slate-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <div className="h-1.5 bg-[linear-gradient(90deg,#0f172a_0%,#334155_40%,#fbbf24_100%)]" />
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{app.label}</CardTitle>
                <Badge variant={app.mode === "current" ? "secondary" : "outline"}>
                  {app.mode === "current" ? "Đang dùng" : "Chuẩn bị mở rộng"}
                </Badge>
              </div>
              <CardDescription>{app.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/20 p-3 text-xs text-muted-foreground break-all">
                Server web cũ: {app.url}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={() => openWorkspaceSection(app.code, "config")}>
                  <Cog className="mr-2 h-4 w-4" />
                  Cấu hình app
                </Button>
                <Button variant="outline" onClick={() => openWorkspaceSection(app.code, "runtime")}>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Runtime app
                </Button>
                <Button variant="outline" className="sm:col-span-2" onClick={() => openTarget(app.url)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Mở server web cũ
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
