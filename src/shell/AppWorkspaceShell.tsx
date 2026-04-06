import { NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { AppWindow, ChevronRight, Cog, LogOut, Menu, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminAppsUrl } from "@/lib/appWorkspace";
import { useAuth } from "@/auth/AuthProvider";

const APP_META: Record<string, { label: string; note: string }> = {
  "find-dumps": {
    label: "Find Dumps",
    note: "Khu điều hành riêng cho app này. Tách khỏi admin tổng để runtime và cấu hình đi theo từng app, không còn nhồi chung một mâm.",
  },
  "free-fire": {
    label: "Free Fire",
    note: "Workspace riêng cho app Free Fire. Giao diện đi theo nhịp của trang thuê nhưng nghiệp vụ vẫn là server app admin-only.",
  },
};

const NAV_ITEMS = [
  { key: "runtime", label: "Runtime app", icon: AppWindow },
  { key: "config", label: "Cấu hình app", icon: Cog },
] as const;

function resolveAppMeta(appCode: string) {
  return APP_META[appCode] ?? {
    label: appCode || "Server app",
    note: "Workspace riêng của app. Logic server giữ nguyên, chỉ tách giao diện và điều hướng để dễ quản lý hơn.",
  };
}

function navButtonClass(isActive: boolean) {
  return [
    "inline-flex h-12 items-center justify-start rounded-2xl border px-4 text-left text-sm font-medium transition-all",
    isActive
      ? "border-amber-300/35 bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.18)] hover:bg-white"
      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white hover:text-slate-950",
  ].join(" ");
}

export function AppWorkspaceShell() {
  const { appCode = "" } = useParams();
  const location = useLocation();
  const meta = resolveAppMeta(appCode);
  const { signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const backToAdminUrl = useMemo(() => getAdminAppsUrl(), []);
  const activeKey = location.pathname.includes("/config") ? "config" : "runtime";
  const activeLabel = NAV_ITEMS.find((item) => item.key === activeKey)?.label ?? "Runtime app";

  const handleBackToAdmin = () => {
    window.location.assign(backToAdminUrl);
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.assign("/login");
  };

  return (
    <section className="space-y-4">
      <div className="xl:hidden space-y-4">
        <div className="overflow-hidden rounded-[28px] border-slate-800 bg-[linear-gradient(135deg,#0b1220_0%,#111827_100%)] text-white shadow-[0_22px_55px_rgba(2,6,23,0.35)]">
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-white shadow-[0_10px_24px_rgba(251,191,36,0.15)]">
                  <AppWindow className="h-5 w-5 text-slate-950" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{meta.label}</div>
                  <div className="truncate text-xs text-slate-400">App domain riêng cho runtime và cấu hình</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white hover:text-slate-950"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white hover:text-slate-950"
                  onClick={handleBackToAdmin}
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">Đang mở: {activeLabel}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-400">Bỏ màn tổng trung gian, vào thẳng khu cần xử lý</span>
            </div>
          </div>
        </div>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 xl:hidden">
            <button
              type="button"
              aria-label="Đóng menu"
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[84vw] max-w-[340px] overflow-y-auto border-r border-white/10 bg-[linear-gradient(180deg,#0b1220_0%,#111827_100%)] p-4 text-white shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Điều hướng app</div>
                  <div className="text-xs text-slate-400">Chọn đúng khu cần mở</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white hover:text-slate-950"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/6 p-4">
                <div className="text-sm font-semibold text-white break-all">{meta.label}</div>
                <div className="mt-2 text-xs leading-6 text-slate-400">{meta.note}</div>
              </div>

              <div className="mt-5 grid gap-2">
                {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                  <NavLink
                    key={key}
                    to={`/apps/${appCode}/${key}`}
                    className={({ isActive }) => navButtonClass(isActive)}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <Icon className="mr-3 h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </div>

              <div className="mt-5 grid gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 justify-start rounded-2xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white hover:text-slate-950"
                  onClick={handleBackToAdmin}
                >
                  <ChevronRight className="mr-3 h-4 w-4 rotate-180" />
                  Quay lại admin tổng
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 justify-start rounded-2xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white hover:text-slate-950"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  Đăng xuất
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden xl:sticky xl:top-6 xl:block xl:self-start">
          <div className="overflow-hidden rounded-[30px] border-slate-800/80 bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] text-white shadow-[0_30px_90px_rgba(2,6,23,0.34)]">
            <div className="space-y-5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-white shadow-[0_10px_24px_rgba(251,191,36,0.15)]">
                    <AppWindow className="h-5 w-5 text-slate-950" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-wide text-white">{meta.label}</div>
                    <div className="text-xs text-slate-400">Điều hướng nhanh tới từng khu app</div>
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 p-2 text-amber-300">
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                <div className="text-sm font-medium text-slate-200">App domain workspace</div>
                <div className="mt-2 text-xs leading-6 text-slate-400">{meta.note}</div>
              </div>

              <div className="grid gap-2">
                {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                  <NavLink key={key} to={`/apps/${appCode}/${key}`} className={({ isActive }) => navButtonClass(isActive)}>
                    <Icon className="mr-3 h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </div>

              <div className="grid gap-2">
                <Button
                  variant="ghost"
                  className="h-11 justify-start rounded-2xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white hover:text-slate-950"
                  onClick={handleBackToAdmin}
                >
                  <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                  Quay lại admin tổng
                </Button>
                <Button
                  variant="ghost"
                  className="h-11 justify-start rounded-2xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white hover:text-slate-950"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Đăng xuất
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-[34px] border-slate-200/80 bg-white text-slate-900 shadow-[0_24px_72px_rgba(15,23,42,0.08)]">
            <div className="h-1.5 bg-[linear-gradient(90deg,#0f172a_0%,#334155_40%,#fbbf24_100%)]" />
            <div className="p-6 sm:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                <AppWindow className="h-3.5 w-3.5" /> App domain
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {activeKey === "runtime" ? "Runtime app" : "Cấu hình app"} · {meta.label}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                Giữ cấu trúc tổng thể gọn như trang thuê, nhưng mỗi app có khu riêng để tránh dồn runtime, credit, plan và reward vào cùng một mặt phẳng. Từ đây chỉ còn 2 cửa chính: cấu hình và runtime.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Admin protected</Badge>
                <Badge variant="outline">{activeLabel}</Badge>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </section>
  );
}
