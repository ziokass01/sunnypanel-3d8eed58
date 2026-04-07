import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "@/auth/AuthProvider";
import { LoginPage } from "@/pages/Login";
import { AdminRoute } from "@/auth/AdminRoute";
import { AuthGate } from "@/auth/AuthGate";
import { PanelRoute } from "@/auth/PanelRoute";
import { AdminShell } from "@/shell/AdminShell";
import { AppWorkspaceShell } from "@/shell/AppWorkspaceShell";
import { DashboardPage } from "@/pages/Dashboard";
import { LicensesListPage } from "@/pages/LicensesList";
import { Licenses2Page } from "@/pages/Licenses2";
import { FreeLicensesPage } from "@/pages/FreeLicenses";
import { LicenseCreatePage } from "@/pages/LicenseCreate";
import { LicenseDetailPage } from "@/pages/LicenseDetail";
import { LicenseEditPage } from "@/pages/LicenseEdit";
import { LicensesTrashPage } from "@/pages/LicensesTrash";
import { AuditLogsPage } from "@/pages/AuditLogs";
import { FreeLandingPage } from "@/pages/FreeLanding";
import { FreeGatePage } from "@/pages/FreeGate";
import { FreeClaimPage } from "@/pages/FreeClaim";
import { AdminFreeKeysPage } from "@/pages/AdminFreeKeys";
import { AdminServerAppsPage } from "@/pages/AdminServerApps";
import { AdminServerAppDetailPage } from "@/pages/AdminServerAppDetail";
import { AdminServerAppRuntimePage } from "@/pages/AdminServerAppRuntime";
import { AdminServerAppTrashPage } from "@/pages/AdminServerAppTrash";
import { RentPortalPage } from "@/pages/RentPortal";
import { RentAdminCustomerSetupPage } from "@/pages/RentAdminCustomerSetup";
import { ServiceLandingPage } from "@/pages/ServiceLanding";
import { ResetKeyPage } from "@/pages/ResetKey";
import { ResetSettingsPage } from "@/pages/ResetSettings";
import { ResetLogsPage } from "@/pages/ResetLogs";
import { buildAppWorkspaceUrl, getAdminLoginUrl } from "@/lib/appWorkspace";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();
const APP_REDIRECT_FLAG = "sunny:app-login-redirected";

function AppHostEntryRedirect() {
  const { user, loading } = useAuth();
  const [showManualLogin, setShowManualLogin] = useState(false);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;

    if (user) {
      window.sessionStorage.removeItem(APP_REDIRECT_FLAG);
      const lastCode = window.localStorage.getItem("sunny:lastAppCode") || "find-dumps";
      const lastSection = window.localStorage.getItem("sunny:lastAppSection") === "config" ? "config" : "runtime";
      window.location.replace(buildAppWorkspaceUrl(lastCode, lastSection));
      return;
    }

    const redirectedOnce = window.sessionStorage.getItem(APP_REDIRECT_FLAG) === "1";
    if (redirectedOnce) {
      setShowManualLogin(true);
      return;
    }

    window.sessionStorage.setItem(APP_REDIRECT_FLAG, "1");
    window.location.replace(getAdminLoginUrl(window.location.href));
  }, [loading, user]);

  if (showManualLogin) {
    return (
      <div className="min-h-svh bg-background">
        <main className="mx-auto flex min-h-svh max-w-3xl items-center justify-center px-4 py-12">
          <div className="w-full rounded-3xl border bg-card p-6 shadow-sm">
            <div className="text-xl font-semibold">Phiên app chưa sẵn sàng</div>
            <p className="mt-3 text-sm text-muted-foreground">
              Đã thử chuyển sang admin một lần. Để tránh vòng lặp đăng nhập, app sẽ dừng tự nhảy qua lại.
              Bấm nút dưới để mở lại trang đăng nhập admin khi bạn muốn.
            </p>
            <div className="mt-4 flex gap-3">
              <Button
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.sessionStorage.removeItem(APP_REDIRECT_FLAG);
                  window.location.replace(getAdminLoginUrl(window.location.href));
                }}
              >
                Mở đăng nhập admin
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Đang chuyển đúng khu điều hành...
    </div>
  );
}

function AdminHostAppRedirect() {
  const { appCode = "", "*": rest = "" } = useParams();
  const location = useLocation();
  const section = rest.startsWith("config") ? "config" : "runtime";
  const target = buildAppWorkspaceUrl(appCode, section, "", location.search);

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Đang chuyển sang app domain...
    </div>
  );
}

function AppSessionBridge() {
  const location = useLocation();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = String(params.get("access_token") ?? "").trim();
    const refreshToken = String(params.get("refresh_token") ?? "").trim();
    const next = String(params.get("next") ?? "/").trim();
    const safeNext = next.startsWith("/") ? next : "/";

    const run = async () => {
      if (!accessToken || !refreshToken) {
        setErrorMessage("Thiếu token bridge để đồng bộ phiên app.");
        return;
      }

      const { error: setError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setError) {
        await supabase.auth.signOut().catch(() => undefined);
        setErrorMessage("Không đồng bộ được phiên app. Hãy mở lại đăng nhập admin.");
        return;
      }

      const refreshed = await supabase.auth.refreshSession();
      const freshSession = refreshed.data.session ?? null;

      if (refreshed.error || !freshSession?.access_token) {
        await supabase.auth.signOut().catch(() => undefined);
        setErrorMessage("Phiên app chưa hợp lệ sau khi đồng bộ. Hãy đăng nhập lại ở admin.");
        return;
      }

      const probe = await supabase.auth.getUser(freshSession.access_token);
      if (probe.error || !probe.data.user) {
        await supabase.auth.signOut().catch(() => undefined);
        setErrorMessage("Không xác minh được phiên app. Hãy đăng nhập lại ở admin.");
        return;
      }

      window.sessionStorage.removeItem(APP_REDIRECT_FLAG);
      window.location.replace(safeNext);
    };

    void run();
  }, [location.key]);

  if (errorMessage) {
    return (
      <div className="min-h-svh bg-background">
        <main className="mx-auto flex min-h-svh max-w-3xl items-center justify-center px-4 py-12">
          <div className="w-full rounded-3xl border bg-card p-6 shadow-sm">
            <div className="text-xl font-semibold">Bridge app-domain bị dừng</div>
            <p className="mt-3 text-sm text-muted-foreground">{errorMessage}</p>
            <div className="mt-4 flex gap-3">
              <Button
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.sessionStorage.removeItem(APP_REDIRECT_FLAG);
                  window.location.replace(getAdminLoginUrl(window.location.href));
                }}
              >
                Mở đăng nhập admin
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Đang đồng bộ phiên đăng nhập cho app domain...
    </div>
  );
}

const App = () => {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const adminHosts = (import.meta.env.VITE_ADMIN_HOSTS ?? "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  const appHosts = (import.meta.env.VITE_APP_HOSTS ?? "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);

  const isAdminHost = host.startsWith("admin.") || adminHosts.includes(host);
  const isAppHost = host.startsWith("app.") || appHosts.includes(host);
  const isControlHost = isAdminHost || isAppHost;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route
                path="/"
                element={isAdminHost ? <Navigate to="/login" replace /> : isAppHost ? <AppHostEntryRedirect /> : <ServiceLandingPage />}
              />

              <Route
                path="/login"
                element={isAdminHost ? <LoginPage /> : isAppHost ? <AppHostEntryRedirect /> : <Navigate to="/" replace />}
              />

              <Route
                path="/auth/bridge"
                element={isAppHost ? <AppSessionBridge /> : <Navigate to="/" replace />}
              />

              <Route path="/free" element={<FreeLandingPage />} />
              <Route path="/free/gate" element={<FreeGatePage />} />
              <Route path="/free/gat" element={<Navigate to="/free/gate" replace />} />
              <Route path="/free/claim" element={<FreeClaimPage />} />
              <Route path="/gate" element={<Navigate to="/free/gate" replace />} />
              <Route path="/claim" element={<Navigate to="/free/claim" replace />} />
              <Route path="/clam" element={<Navigate to="/free/claim" replace />} />

              {!isControlHost && <Route path="/rent" element={<RentPortalPage />} />}
              {!isControlHost && <Route path="/reset-key" element={<ResetKeyPage />} />}

              {isAdminHost && (
                <Route
                  element={
                    <AuthGate>
                      <PanelRoute>
                        <AdminShell />
                      </PanelRoute>
                    </AuthGate>
                  }
                >
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/licenses" element={<LicensesListPage />} />
                  <Route path="/licenses2" element={<Licenses2Page />} />
                  <Route path="/licenses/new" element={<LicenseCreatePage />} />
                  <Route path="/licenses2/new" element={<LicenseCreatePage />} />
                  <Route path="/licenses/:id" element={<LicenseDetailPage />} />
                  <Route path="/licenses/:id/edit" element={<LicenseEditPage />} />
                  <Route path="/free-licenses" element={<AdminRoute><FreeLicensesPage /></AdminRoute>} />
                  <Route path="/licenses/trash" element={<LicensesTrashPage />} />
                  <Route path="/audit" element={<AuditLogsPage />} />
                  <Route path="/admin/free-keys" element={<AdminRoute><AdminFreeKeysPage /></AdminRoute>} />
                  <Route path="/admin/apps" element={<AdminRoute><AdminServerAppsPage /></AdminRoute>} />
                  <Route path="/admin/apps/:appCode" element={<AdminRoute><AdminHostAppRedirect /></AdminRoute>} />
                  <Route path="/admin/apps/:appCode/runtime" element={<AdminRoute><AdminHostAppRedirect /></AdminRoute>} />
                  <Route path="/apps/:appCode" element={<AdminRoute><AdminHostAppRedirect /></AdminRoute>} />
                  <Route path="/apps/:appCode/*" element={<AdminRoute><AdminHostAppRedirect /></AdminRoute>} />
                  <Route path="/rent" element={<AdminRoute><RentAdminCustomerSetupPage /></AdminRoute>} />
                  <Route path="/settings/reset-key" element={<AdminRoute><ResetSettingsPage /></AdminRoute>} />
                  <Route path="/settings/reset-logs" element={<AdminRoute><ResetLogsPage /></AdminRoute>} />
                </Route>
              )}

              {isAppHost && (
                <Route
                  path="/apps/:appCode"
                  element={
                    <AuthGate>
                      <PanelRoute>
                        <AdminRoute>
                          <AppWorkspaceShell />
                        </AdminRoute>
                      </PanelRoute>
                    </AuthGate>
                  }
                >
                  <Route index element={<Navigate to="runtime" replace />} />
                  <Route path="dashboard" element={<Navigate to="../runtime" replace />} />
                  <Route path="internal" element={<Navigate to="../config" replace />} />
                  <Route path="config" element={<AdminServerAppDetailPage />} />
                  <Route path="runtime" element={<AdminServerAppRuntimePage />} />
                  <Route path="trash" element={<AdminServerAppTrashPage />} />
                </Route>
              )}

              <Route path="*" element={isAppHost ? <AppHostEntryRedirect /> : <NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
