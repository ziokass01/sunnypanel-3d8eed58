import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminAppsUrl } from "@/lib/appWorkspace";

const APP_META: Record<string, { label: string; note: string }> = {
  "find-dumps": {
    label: "Find Dumps",
    note: "Web riêng của app này. Tại đây chỉ tập trung vào 2 nhánh lớn là Cấu hình app và Runtime. Mọi logic server vẫn dùng chung backend admin hiện tại.",
  },
  "free-fire": {
    label: "Free Fire",
    note: "Khu làm việc riêng của app Free Fire. Tách khỏi admin tổng để về sau có nhiều app vẫn dễ nhìn và không đè nhau.",
  },
};

function resolveAppMeta(appCode: string) {
  return APP_META[appCode] ?? {
    label: appCode || "Server app",
    note: "Web riêng cho app này. Vẫn trực thuộc quyền admin, chỉ đổi điều hướng và mặt giao diện.",
  };
}

function tabClass(isActive: boolean) {
  return [
    "group rounded-[28px] border p-5 transition-all",
    isActive
      ? "border-primary/50 bg-primary/10 shadow-sm"
      : "border-border/70 bg-card hover:border-primary/30 hover:bg-muted/40",
  ].join(" ");
}

export function AppWorkspaceShell() {
  const { appCode = "" } = useParams();
  const meta = resolveAppMeta(appCode);

  return (
    <section className="space-y-4">
      <header className="rounded-[36px] border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Admin</Badge>
              <Badge variant="outline">app.mityangho.id.vn</Badge>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{meta.label}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{meta.note}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={getAdminAppsUrl()}>← Quay lại admin tổng</a>
            </Button>
          </div>
        </div>
      </header>

      <nav className="grid gap-4 lg:grid-cols-2">
        <NavLink to={`/apps/${appCode}/config`} className={({ isActive }) => tabClass(isActive)}>
          <div className="space-y-2">
            <div className="text-lg font-semibold">Cấu hình app</div>
            <div className="text-sm leading-6 text-muted-foreground">
              Quản lý app settings, plans, credit, feature flags, wallet rules và reward/redeem. Khi bấm vào đây, bên dưới sẽ hiện các tab nhỏ để chỉnh sâu từng mảng.
            </div>
          </div>
        </NavLink>

        <NavLink to={`/apps/${appCode}/runtime`} className={({ isActive }) => tabClass(isActive)}>
          <div className="space-y-2">
            <div className="text-lg font-semibold">Runtime</div>
            <div className="text-sm leading-6 text-muted-foreground">
              Điều khiển runtime, simulator, ops, sessions, wallets, events và transactions. Đây là nhánh vận hành để soi log, test flow và xử lý user đang chạy thật.
            </div>
          </div>
        </NavLink>
      </nav>

      <div className="min-w-0">
        <Outlet />
      </div>
    </section>
  );
}
