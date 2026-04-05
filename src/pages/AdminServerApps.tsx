import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAppWorkspaceOrigin, getAppWorkspaceUrl } from "@/lib/appWorkspace";

const APPS = [
  {
    code: "free-fire",
    label: "Free Fire",
    description: "Server web hiện tại cho app Free Fire. Từ đây bạn nhảy sang web app riêng để chỉnh cấu hình hoặc runtime mà không lẫn với admin tổng.",
    url: (import.meta.env.VITE_SERVER_APP_FREE_FIRE_URL as string | undefined)?.trim() || "/admin/free-keys?app=free-fire",
    mode: "current",
  },
  {
    code: "find-dumps",
    label: "Find Dumps",
    description: "Server web dành cho app Find Dumps. Cấu hình app và runtime sẽ nằm trên app.mityangho.id.vn để tách hẳn khỏi admin tổng.",
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

  const openAppWorkspace = (appCode: string, tab: "config" | "runtime") => {
    window.location.assign(getAppWorkspaceUrl(appCode, tab));
  };

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Server app</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Từ đây chỉ còn vai trò cổng tổng. Khi bấm <span className="font-medium text-foreground">Cấu hình app</span> hoặc <span className="font-medium text-foreground">Runtime app</span>,
              hệ thống sẽ chuyển sang web riêng trên <span className="font-medium text-foreground">{getAppWorkspaceOrigin()}</span>. Vẫn dùng chung quyền admin hiện tại, chỉ tách giao diện để khỏi rối khi số app tăng lên.
            </p>
          </div>
          <Badge variant="outline">App domain</Badge>
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
                Server web: {app.url}
                <br />
                App workspace: {getAppWorkspaceUrl(app.code, "config")}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => openTarget(app.url)}>Mở server web</Button>
                <Button variant="outline" onClick={() => openAppWorkspace(app.code, "config")}>
                  Cấu hình app
                </Button>
                <Button variant="outline" onClick={() => openAppWorkspace(app.code, "runtime")}>
                  Runtime app
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
