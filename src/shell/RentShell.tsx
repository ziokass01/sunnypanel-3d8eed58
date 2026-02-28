import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, LayoutDashboard, Plug, LogOut } from "lucide-react";

const NAV = [
  { to: "/rent", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/rent/keys", label: "Key khách", icon: KeyRound },
  { to: "/rent/integration", label: "Tích hợp", icon: Plug },
];

export default function RentShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r hidden md:flex flex-col">
        <div className="p-4 border-b">
          <div className="font-semibold">Thuê Website</div>
          <div className="text-xs text-muted-foreground">Portal khách thuê</div>
        </div>
        <nav className="p-2 space-y-1 flex-1">
          {NAV.map((it) => {
            const active = location.pathname === it.to || location.pathname.startsWith(it.to + "/");
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t">
          <Button variant="outline" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Đăng xuất
          </Button>
        </div>
      </aside>

      <main className="flex-1">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
          <div className="font-medium md:hidden">Thuê Website</div>
          <div className="md:hidden">
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </main>
    </div>
  );
}
