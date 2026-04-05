import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const APP_META: Record<string, { label: string; note: string }> = {
  "find-dumps": {
    label: "Find Dumps",
    note: "Khu điều hành riêng cho app này. Vẫn chịu quyền admin, chỉ đổi giao diện và điều hướng để đỡ nhầm với admin tổng.",
  },
  "free-fire": {
    label: "Free Fire",
    note: "Workspace riêng cho app Free Fire. Dùng để tách cấu hình và runtime ra khỏi admin tổng.",
  },
};

function resolveAppMeta(appCode: string) {
  return APP_META[appCode] ?? {
    label: appCode || "Server app",
    note: "Workspace riêng của app. Logic server giữ nguyên, chỉ tách giao diện và điều hướng.",
  };
}

function navClass(isActive: boolean) {
  return [
    "flex items-center rounded-2xl px-4 py-3 text-sm transition-colors",
    isActive
      ? "bg-primary text-primary-foreground shadow-sm"
      : "border border-border/70 bg-background text-foreground hover:bg-muted",
  ].join(" ");
}

export function AppWorkspaceShell() {
  const { appCode = "" } = useParams();
  const location = useLocation();
  const meta = resolveAppMeta(appCode);
  const internalActive = location.pathname.includes("/internal");
  const runtimeActive = location.pathname.includes("/runtime");

  return (
    <section className="grid gap-4 lg:grid-cols-[260px,minmax(0,1fr)]">
      <aside className="space-y-4 rounded-[32px] border bg-card p-4">
        <div className="space-y-3 rounded-[28px] border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{meta.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{appCode}</div>
            </div>
            <Badge variant="secondary">Admin</Badge>
          </div>
          <div className="text-xs leading-5 text-muted-foreground">{meta.note}</div>
          <Button asChild variant="outline" size="sm" className="w-full justify-start">
            <Link to="/admin/apps">← Quay lại danh sách app</Link>
          </Button>
        </div>

        <nav className="space-y-2">
          <NavLink to={`/apps/${appCode}/dashboard`} className={({ isActive }) => navClass(isActive)}>
            Dashboard app
          </NavLink>
          <NavLink to={`/apps/${appCode}/internal`} className={() => navClass(internalActive)}>
            Cấu hình nội bộ
          </NavLink>
          <NavLink to={`/apps/${appCode}/runtime`} className={() => navClass(runtimeActive)}>
            Runtime admin
          </NavLink>
        </nav>

        <div className="rounded-[28px] border p-4 text-xs leading-5 text-muted-foreground">
          Đây là lớp điều hướng riêng cho từng app. Nó chỉ dời đường đi và bố cục, không đụng vào logic xác thực, runtime hay quyền admin đang chạy.
        </div>
      </aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </section>
  );
}
