import { NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const APP_META: Record<string, { label: string; note: string }> = {
  "find-dumps": {
    label: "Find Dumps",
    note: "Khu điều hành riêng cho app này. Giao diện tách khỏi admin tổng để về sau thêm nhiều app vẫn không rối.",
  },
  "free-fire": {
    label: "Free Fire",
    note: "Workspace riêng cho app Free Fire. Cấu hình app và runtime nằm cùng một domain app nhưng vẫn dưới quyền admin.",
  },
};

function resolveAppMeta(appCode: string) {
  return APP_META[appCode] ?? {
    label: appCode || "Server app",
    note: "Workspace riêng của app. Logic server giữ nguyên, chỉ tách giao diện và điều hướng.",
  };
}

function tabClass(isActive: boolean) {
  return [
    "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-medium transition-colors",
    isActive
      ? "bg-primary text-primary-foreground shadow-sm"
      : "border border-border/70 bg-background text-foreground hover:bg-muted",
  ].join(" ");
}

export function AppWorkspaceShell() {
  const { appCode = "" } = useParams();
  const location = useLocation();
  const meta = resolveAppMeta(appCode);
  const configActive = location.pathname.includes("/config") || location.pathname.includes("/internal");
  const runtimeActive = location.pathname.includes("/runtime");

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-[36px] border bg-card">
        <div className="border-b bg-gradient-to-r from-primary/10 via-background to-primary/5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">App workspace</Badge>
                <Badge variant="outline">Admin protected</Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{meta.label}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{meta.note}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.location.assign("/admin/apps")}>
                ← Quay lại admin console
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b bg-background/70 p-4">
          <div className="flex flex-wrap gap-3">
            <NavLink to={`/apps/${appCode}/config`} className={() => tabClass(configActive)}>
              Cấu hình app
            </NavLink>
            <NavLink to={`/apps/${appCode}/runtime`} className={() => tabClass(runtimeActive)}>
              Runtime
            </NavLink>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Đây là 2 tab lớn của domain app. Bấm tab lớn nào thì mới vào khu điều khiển tổng thể của tab đó, còn các tab nhỏ chi tiết sẽ nằm bên trong từng khu.
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <Outlet />
      </div>
    </section>
  );
}
