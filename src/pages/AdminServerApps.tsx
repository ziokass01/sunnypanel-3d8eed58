import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAppWorkspaceUrl } from "@/lib/appWorkspace";

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
  const openTarget = (url: string) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(url);
  };

  const openWorkspace = (appCode: string, section: "config" | "runtime") => {
    window.location.assign(buildAppWorkspaceUrl(appCode, section));
  };

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Server app</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Admin tổng chỉ là cổng vào. Khi bấm cấu hình app hoặc runtime app, bạn sẽ được đưa sang hẳn domain
              <span className="mx-1 font-medium text-foreground">app.mityangho.id.vn</span>
              để tránh nhầm với giao diện admin chính.
            </p>
          </div>
          <Badge variant="outline">App domain workspace</Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {APPS.map((app) => (
          <Card key={app.code} className="overflow-hidden">
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
                {app.url}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={() => openWorkspace(app.code, "config")}>Cấu hình app</Button>
                <Button variant="outline" onClick={() => openWorkspace(app.code, "runtime")}>Runtime app</Button>
                <Button variant="outline" onClick={() => openTarget(app.url)}>Mở server web</Button>
                <Button variant="outline" onClick={() => openWorkspace(app.code, "config")}>Mở app workspace</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
