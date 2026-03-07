import { Outlet, useNavigate } from "react-router-dom";
import { LogOut, KeyRound, LayoutDashboard, Trash2, ScrollText, KeySquare, Gift, Ticket, Building2 } from "lucide-react";

import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, SidebarFooter } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/auth/AuthProvider";

export function AdminShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">SUNNY Key Panel</div>
              <div className="truncate text-xs text-muted-foreground">Admin</div>
            </div>
            <SidebarTrigger />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Dashboard">
                <NavLink
                  to="/dashboard"
                  className=""
                  activeClassName="data-[active=true]"
                >
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Licenses">
                <NavLink to="/licenses">
                  <KeyRound />
                  <span>Licenses</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Licenses 2">
                <NavLink to="/licenses2">
                  <KeySquare />
                  <span>Licenses 2</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Free Licenses">
                <NavLink to="/free-licenses">
                  <Ticket />
                  <span>Free Licenses</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Trash">
                <NavLink to="/licenses/trash">
                  <Trash2 />
                  <span>Trash</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Audit logs">
                <NavLink to="/audit">
                  <ScrollText />
                  <span>Audit logs</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Free keys">
                <NavLink to="/admin/free-keys">
                  <Gift />
                  <span>Free keys</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Thuê Website">
                <NavLink to="/rent">
                  <Building2 />
                  <span>Thuê Website</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
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