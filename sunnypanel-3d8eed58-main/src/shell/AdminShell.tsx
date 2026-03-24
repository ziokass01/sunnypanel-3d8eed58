import { Outlet, useNavigate } from "react-router-dom";
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

export function AdminShell() {
  const { signOut } = useAuth();
  const { role, isAdmin, isUserLike } = usePanelRole();
  const navigate = useNavigate();

  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "moderator"
        ? "Moderator"
        : role === "user"
          ? "User"
          : "Panel";

  const roleVariant =
    role === "admin" ? "default" : role === "moderator" ? "secondary" : "outline";

  const showLockedToast = (section: string) => {
    toast({
      title: "Quyền truy cập bị giới hạn",
      description: `Tài khoản của bạn đang dùng quyền giới hạn. Mục ${section} chỉ dành cho quản trị viên.`,
    });
  };

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">SUNNY Key Panel</div>
              <div className="mt-1"><Badge variant={roleVariant as any}>{roleLabel}</Badge></div>
            </div>
            <SidebarTrigger />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Dashboard">
                <NavLink to="/dashboard" activeClassName="data-[active=true]">
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Licenses">
                <NavLink to="/licenses" activeClassName="data-[active=true]">
                  <KeyRound />
                  <span>Licenses</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Licenses 2">
                <NavLink to="/licenses2" activeClassName="data-[active=true]">
                  <KeySquare />
                  <span>Licenses 2</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {isUserLike ? (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Trash">
                    <NavLink to="/licenses/trash" activeClassName="data-[active=true]">
                      <Trash2 />
                      <span>Trash</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Audit logs">
                    <NavLink to="/audit" activeClassName="data-[active=true]">
                      <ScrollText />
                      <span>Audit logs</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            ) : null}

            {isAdmin ? (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Free Licenses">
                    <NavLink to="/free-licenses" activeClassName="data-[active=true]">
                      <Ticket />
                      <span>Free Licenses</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Free keys">
                    <NavLink to="/admin/free-keys" activeClassName="data-[active=true]">
                      <Gift />
                      <span>Free keys</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Thuê Website">
                    <NavLink to="/rent" activeClassName="data-[active=true]">
                      <Building2 />
                      <span>Thuê Website</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Reset Settings">
                    <NavLink to="/settings/reset-key" activeClassName="data-[active=true]">
                      <SlidersHorizontal />
                      <span>Reset Settings</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Reset Logs">
                    <NavLink to="/settings/reset-logs" activeClassName="data-[active=true]">
                      <History />
                      <span>Reset Logs</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            ) : (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Free Licenses" className="opacity-60" onClick={() => showLockedToast("Free Licenses")}>
                    <Ticket />
                    <span>Free Licenses</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Free keys" className="opacity-60" onClick={() => showLockedToast("Free keys")}>
                    <Gift />
                    <span>Free keys</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Thuê Website" className="opacity-60" onClick={() => showLockedToast("Thuê Website")}>
                    <Building2 />
                    <span>Thuê Website</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Reset Settings" className="opacity-60" onClick={() => showLockedToast("Reset Settings")}>
                    <SlidersHorizontal />
                    <span>Reset Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Reset Logs" className="opacity-60" onClick={() => showLockedToast("Reset Logs")}>
                    <History />
                    <span>Reset Logs</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <Button
            variant="soft"
            className="mx-2 justify-start"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <div className="text-sm text-muted-foreground">Admin Console</div>
        </header>
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
