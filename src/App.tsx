import { useEffect, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
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
import { buildAdminAppUrl, getAdminAppsUrl, getAdminLoginUrl } from "@/lib/appWorkspace";

const queryClient = new QueryClient();

function resolveLegacyAdminTarget(pathname: string, search = "") {
  const match = pathname.match(/^\/apps\/([^/]+)(?:\/(.*))?$/i);
  if (!match) return `${getAdminAppsUrl()}${search || ""}`;

  const appCode = decodeURIComponent(match[1] || "");
  const rest = String(match[2] || "").replace(/^\/+/, "");
  const parts = rest ? rest.split("/").filter(Boolean) : [];
  const head = parts[0] || "";
  const section = head === "config" ? "config" : head === "trash" ? "trash" : "runtime";
  const extraPath = parts.length > 1 ? parts.slice(1).join("/") : "";
  return buildAdminAppUrl(appCode, section, extraPath, search || "");
}

function AppHostEntryRedirect() {
  const location = useLocation();

  const target = useMemo(() => {
    if (location.pathname.startsWith("/apps/")) {
      return resolveLegacyAdminTarget(location.pathname, location.search);
    }
    if (location.pathname === "/login") {
      return getAdminLoginUrl(getAdminAppsUrl());
    }
    return getAdminAppsUrl();
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.location.replace(target);
  }, [target]);

  return <div className="p-6 text-sm text-muted-foreground">Đang chuyển về admin để tránh loop domain...</div>;
}

function LegacyWorkspaceRedirect() {
  const { appCode = "", "*": rest = "" } = useParams();
  const location = useLocation();
  const parts = String(rest || "").replace(/^\/+/, "").split("/").filter(Boolean);
  const head = parts[0] || "";
  const section = head === "config" ? "config" : head === "trash" ? "trash" : "runtime";
  const extraPath = parts.length > 1 ? parts.slice(1).join("/") : "";
  const target = buildAdminAppUrl(appCode, section, extraPath, location.search);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.location.replace(target);
  }, [target]);

  return <div className="p-6 text-sm text-muted-foreground">Đang chuyển sang đường dẫn admin chuẩn...</div>;
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
                  <Route path="/admin/apps/:appCode" element={<AdminRoute><AppWorkspaceShell /></AdminRoute>}>
                    <Route index element={<AdminServerAppDetailPage />} />
                    <Route path="dashboard" element={<Navigate to="../runtime" replace />} />
                    <Route path="internal" element={<Navigate to="../config" replace />} />
                    <Route path="config" element={<AdminServerAppDetailPage />} />
                    <Route path="runtime" element={<AdminServerAppRuntimePage />} />
                    <Route path="trash" element={<AdminServerAppTrashPage />} />
                  </Route>
                  <Route path="/apps/:appCode" element={<AdminRoute><LegacyWorkspaceRedirect /></AdminRoute>} />
                  <Route path="/apps/:appCode/*" element={<AdminRoute><LegacyWorkspaceRedirect /></AdminRoute>} />
                  <Route path="/rent" element={<AdminRoute><RentAdminCustomerSetupPage /></AdminRoute>} />
                  <Route path="/settings/reset-key" element={<AdminRoute><ResetSettingsPage /></AdminRoute>} />
                  <Route path="/settings/reset-logs" element={<AdminRoute><ResetLogsPage /></AdminRoute>} />
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
