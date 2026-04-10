import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { AppWindow, ChevronRight, Cog, Coins, KeyRound, Logs, Menu, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildAppWorkspaceUrl, buildWorkspacePath, detectWorkspaceScope, getWorkspaceListPath, isAdminHostName } from "@/lib/appWorkspace";
import { getServerAppMeta, type WorkspaceSection } from "@/lib/serverAppPolicies";

const NAV_ITEMS = [
  { key: "config", label: "Cấu hình app", icon: Cog },
  { key: "runtime", label: "Runtime app", icon: AppWindow },
  { key: "keys", label: "Server key", icon: KeyRound },
  { key: "charge", label: "Charge / Credit Rules", icon: Coins },
  { key: "audit", label: "Audit Log", icon: Logs },
  { key: "trash", label: "Trash", icon: Trash2 },
] as const;

function navButtonClass(isActive: boolean) {
  return [
    "inline-flex h-11 items-center justify-start rounded-2xl border px-4 text-left text-sm font-medium transition-all",
    isActive
      ? "border-amber-300/35 bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.18)] hover:bg-white"
      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white hover:text-slate-950",
  ].join(" ");
}

function resolveActiveKey(pathname: string): WorkspaceSection {
  if (pathname.includes("/trash")) return "trash";
  if (pathname.includes("/audit")) return "audit";
  if (pathname.includes("/charge")) return "charge";
  if (pathname.includes("/keys")) return "keys";
  if (pathname.includes("/config")) return "config";
  return "runtime";
}

export function AppWorkspaceShell() {
  const { appCode = "" } = useParams();
  const location = useLocation();
  const meta = getServerAppMeta(appCode);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scope = detectWorkspaceScope(location.pathname);
  const listPath = useMemo(() => getWorkspaceListPath(scope, location.pathname), [scope, location.pathname]);
  const activeKey = resolveActiveKey(location.pathname);
  const activeLabel = NAV_ITEMS.find((item) => item.key === activeKey)?.label ?? "Runtime app";

  useEffect(() => {
    if (typeof window === "undefined" || !appCode) return;
    window.localStorage.setItem("sunny:lastAppCode", appCode);
    window.localStorage.setItem("sunny:lastAppSection", activeKey);
  }, [appCode, activeKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !appCode) return;
    if (!isAdminHostName(window.location.hostname)) return;
    const target = buildAppWorkspaceUrl(appCode, activeKey, "", window.location.search || "") + (window.location.hash || "");
    const current = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== target) {
      window.location.replace(target);
    }
  }, [appCode, activeKey, location.pathname, location.search, location.hash]);

  const handleBackToList = () => window.location.assign(listPath);
  const buildNavPath = (section: WorkspaceSection) => buildWorkspacePath(appCode, section, scope, "", "", location.pathname);

  return (
    <section className="space-y-4 px-1">
      <div className="space-y-4 xl:hidden">
        <div className="overflow-hidden rounded-[26px] border border-slate-200/70 bg-white text-slate-950 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-white shadow-[0_10px_24px_rgba(251,191,36,0.15)]">
                  <AppWindow className="h-5 w-5 text-slate-700" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">{meta.label}</div>
                  <div className="truncate text-xs text-slate-500">{meta.mode === "legacy" ? "Nhánh legacy giữ nguyên" : "6 tab app-host tách riêng"}</div>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-950 hover:text-white" onClick={() => setMobileNavOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">{activeLabel}</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-500">{meta.note || meta.description}</span>
            </div>
          </div>
        </div>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 xl:hidden">
            <button type="button" aria-label="Đóng menu" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-slate-950 text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.4)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold">{meta.label}</div>
                  <div className="text-xs text-slate-400">{meta.mode === "legacy" ? "Điều hướng legacy" : "App-host workbench"}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => setMobileNavOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-2">
                  {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                    <NavLink key={key} to={buildNavPath(key)} className={({ isActive }) => navButtonClass(isActive)} onClick={() => setMobileNavOpen(false)}>
                      <Icon className="mr-3 h-4 w-4" />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/10 p-4">
                <Button type="button" variant="outline" className="w-full border-white/15 bg-white/5 text-slate-100 hover:bg-white hover:text-slate-950" onClick={handleBackToList}>
                  <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                  Quay lại danh sách app
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-hidden rounded-[30px] xl:block">
        <div className="grid gap-4 xl:grid-cols-[290px,minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 text-slate-100 shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
            <div className="border-b border-white/10 px-6 py-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><AppWindow className="h-5 w-5" /></div>
              <div className="mt-4 space-y-1">
                <div className="text-lg font-semibold">{meta.label}</div>
                <p className="text-sm text-slate-300">{meta.description}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-white/15 bg-white/5 text-slate-100">{meta.mode === "legacy" ? "Legacy" : "App-host"}</Badge>
                <Badge variant="outline" className="border-white/15 bg-white/5 text-slate-100">6 vùng quản trị</Badge>
              </div>
            </div>
            <nav className="space-y-2 px-4 py-4">
              {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                <NavLink key={key} to={buildNavPath(key)} className={({ isActive }) => navButtonClass(isActive)}>
                  <Icon className="mr-3 h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-white/10 p-4">
              <Button type="button" variant="outline" className="w-full border-white/15 bg-white/5 text-slate-100 hover:bg-white hover:text-slate-950" onClick={handleBackToList}>
                <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                Quay lại danh sách app
              </Button>
            </div>
          </aside>
          <div className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-200/70 px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{meta.label}</Badge>
                <Badge variant="outline">{activeLabel}</Badge>
              </div>
            </div>
            <div className="p-6"><Outlet /></div>
          </div>
        </div>
      </div>

      <div className="xl:hidden"><Outlet /></div>
    </section>
  );
}
