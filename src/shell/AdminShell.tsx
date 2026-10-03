import {ModeratorBalance} from "@/features/moderator/ModeratorBalance";
import "@/features/admin/admin-workspace.css";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LogOut,
  KeyRound,
  LayoutDashboard,
  Trash2,
  ScrollText,
  KeySquare,
  Gift,
  Ticket,
  Building2,
  SlidersHorizontal,
  History,
  ChevronRight,
  AppWindow,
  Bot,
  Users,
} from "lucide-react";

import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/auth/AuthProvider";
import { usePanelRole } from "@/hooks/use-panel-role";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function BrandMark() {
  return (
    <img
      src="/android-chrome-512x512.png"
      alt="SUNNY"
      className="h-12 w-12 rounded-[1.1rem] object-cover shadow-[0_14px_26px_-18px_rgba(15,23,42,0.35)]"
    />
  );
}

export function AdminShell() {
  const { signOut } = useAuth();
  const { role, isAdmin, isUserLike } = usePanelRole();
  const navigate = useNavigate();
  const location = useLocation();

  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "moderator"
        ? "Moderator"
        : role === "user"
          ? "User"
          : "Panel";

  const roleVariant = role === "admin" ? "outline" : role === "moderator" ? "secondary" : "outline";

  const showLockedToast = (section: string) => {
    toast({
      title: "Quyền truy cập bị giới hạn",
      description: `Tài khoản của bạn đang dùng quyền giới hạn. Mục ${section} chỉ dành cho quản trị viên.`,
    });
  };

  const items = [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, show: true },
    { label: "Licenses", to: "/licenses", icon: KeyRound, show: true },
    { label: "Trash", to: "/licenses/trash", icon: Trash2, show: isUserLike },
    { label: "Audit logs", to: "/audit", icon: ScrollText, show: isUserLike },
    { label: "Free Licenses", to: "/free-licenses", icon: Ticket, show: true, adminOnly: true },
    { label: "Free keys", to: "/admin/free-keys", icon: Gift, show: true, adminOnly: true },
    { label: "Thuê Website", to: "/rent", icon: Building2, show: true, adminOnly: true },
    { label: "Reset Settings", to: "/settings/reset-key", icon: SlidersHorizontal, show: true, adminOnly: true },
    { label: "Reset Logs", to: "/settings/reset-logs", icon: History, show: true, adminOnly: true },
    { label: "Server app", to: "/admin/apps", icon: AppWindow, show: true, adminOnly: true },
    { label: "SunnyMod AI", to: "/admin/ai", icon: Bot, show: true, adminOnly: true },
    { label: "Moderator · Xu", to: "/admin/moderator-wallet", icon: Users, show: true, adminOnly: true },
    { label: "Support Member", to: "/admin/support-member", icon: Users, show: true, adminOnly: true },
  ] as const;

  const visibleItems = items.filter(item => item.show && (role!=="moderator" || item.to==="/licenses" || item.to==="/licenses/trash"));
  const activeItem = [...visibleItems].filter(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)).sort((a,b) => b.to.length-a.to.length)[0];
  const activeLabel = activeItem?.label ?? "Admin Console";

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <div className="panel-shell flex items-center gap-3 px-4 py-4">
            <BrandMark />
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="break-words text-base font-semibold text-slate-950">SUNNY Key Panel</div>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={roleVariant as any}>{roleLabel}</Badge>
                <span className="break-words text-xs text-slate-500">Quản lý key & ứng dụng</span>
              </div>
            </div>
            <SidebarTrigger className="bg-white text-slate-600 shadow-sm hover:bg-slate-100" />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isLocked = Boolean("adminOnly" in item && item.adminOnly && !isAdmin);
              const isActive = activeItem?.to === item.to;

              return (
                <SidebarMenuItem key={item.to}>
                  {isLocked ? (
                    <SidebarMenuButton
                      tooltip={item.label}
                      onClick={() => showLockedToast(item.label)}
                      className="text-slate-400"
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild tooltip={item.label} isActive={isActive}>
                      <a href={item.to} onClick={e=>{e.preventDefault();navigate(item.to);}} className="w-full" aria-current={isActive?"page":undefined}>
                        <Icon />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <Button
            variant="soft"
            className="justify-start group-data-[collapsible=icon]:justify-center"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-white/70 bg-background/85 backdrop-blur-md">
          <div className="page-wrap flex items-center gap-3 py-4">
            <SidebarTrigger className="bg-white text-slate-600 shadow-sm hover:bg-slate-100 md:hidden" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="shrink-0 font-medium text-slate-600">{role==="moderator"?"Moderator":"Admin Console"}</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
              <span className="break-words font-semibold text-slate-950">{activeLabel}</span>
            </div>
            {role==="moderator"&&<ModeratorBalance/>}
          </div>
        </header>

        <main className="admin-console page-wrap flex-1 py-5">
          <div className={cn("rounded-[2rem] border border-white/60 bg-white/65 p-4 shadow-[0_26px_80px_-50px_rgba(15,23,42,0.22)] backdrop-blur-sm sm:p-5") }>
            {role==="moderator" && !/^\/licenses(?:2)?(?:\/|$)/.test(location.pathname)?<Navigate to="/licenses" replace/>:<Outlet />}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
