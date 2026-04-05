import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
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
import { RentPortalPage } from "@/pages/RentPortal";
import { RentAdminCustomerSetupPage } from "@/pages/RentAdminCustomerSetup";
import { ServiceLandingPage } from "@/pages/ServiceLanding";
import { ResetKeyPage } from "@/pages/ResetKey";
import { ResetSettingsPage } from "@/pages/ResetSettings";
import { ResetLogsPage } from "@/pages/ResetLogs";
import { getAdminAppsUrl, getAppWorkspaceUrl, isAdminConsoleHost, isAppWorkspaceHost } from "@/lib/appWorkspace";

const queryClient = new QueryClient();

function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    if (!to) return;
    window.location.replace(to);
  }, [to]);

  return <div className="text-sm text-muted-foreground">Đang chuyển trang...</div>;
}

function LegacyAdminAppDetailRedirect() {
  const { appCode = "" } = useParams();
  return <ExternalRedirect to={getAppWorkspaceUrl(appCode, "config")} />;
}

function LegacyAdminAppRuntimeRedirect() {
  const { appCode = "" } = useParams();
  return <ExternalRedirect to={getAppWorkspaceUrl(appCode, "runtime")} />;
}

function AppHostBackToAdminRedirect() {
  return <ExternalRedirect to={getAdminAppsUrl()} />;
}

function AppHostConfigRedirect() {
  const { appCode = "" } = useParams();
  return <Navigate to={`/apps/${appCode}/config`} replace />;
}

function AppHostRuntimeRedirect() {
  const { appCode = "" } = useParams();
  return <Navigate to={`/apps/${appCode}/runtime`} replace />;
}

const App = () => {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const isAdminHost = isAdminConsoleHost(host);
  const isAppHost = isAppWorkspaceHost(host);
  const isPanelHost = isAdminHost || isAppHost;

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
                element={isPanelHost ? <Navigate to="/login" replace /> : <ServiceLandingPage />}
              />

              <Route
                path="/login"
                element={isPanelHost ? <LoginPage /> : <Navigate to="/" replace />}
              />

              <Route path="/free" element={<FreeLandingPage />} />
              <Route path="/free/gate" element={<FreeGatePage />} />
              <Route path="/free/gat" element={<Navigate to="/free/gate" replace />} />
              <Route path="/free/claim" element={<FreeClaimPage />} />
              <Route path="/gate" element={<Navigate to="/free/gate" replace />} />
              <Route path="/claim" element={<Navigate to="/free/claim" replace />} />
              <Route path="/clam" element={<Navigate to="/free/claim" replace />} />

              {!isPanelHost && <Route path="/rent" element={<RentPortalPage />} />}
              {!isPanelHost && <Route path="/reset-key" element={<ResetKeyPage />} />}

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
                  <Route path="/admin/apps/:appCode" element={<AdminRoute><LegacyAdminAppDetailRedirect /></AdminRoute>} />
                  <Route path="/admin/apps/:appCode/runtime" element={<AdminRoute><LegacyAdminAppRuntimeRedirect /></AdminRoute>} />
                  <Route path="/rent" element={<AdminRoute><RentAdminCustomerSetupPage /></AdminRoute>} />
                  <Route path="/settings/reset-key" element={<AdminRoute><ResetSettingsPage /></AdminRoute>} />
                  <Route path="/settings/reset-logs" element={<AdminRoute><ResetLogsPage /></AdminRoute>} />
                </Route>
              )}

              {isAppHost && (
                <>
                  <Route path="/admin/apps" element={<AuthGate><PanelRoute><AdminRoute><AppHostBackToAdminRedirect /></AdminRoute></PanelRoute></AuthGate>} />
                  <Route path="/admin/apps/:appCode" element={<AuthGate><PanelRoute><AdminRoute><AppHostConfigRedirect /></AdminRoute></PanelRoute></AuthGate>} />
                  <Route path="/admin/apps/:appCode/runtime" element={<AuthGate><PanelRoute><AdminRoute><AppHostRuntimeRedirect /></AdminRoute></PanelRoute></AuthGate>} />

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
                    <Route index element={<Navigate to="config" replace />} />
                    <Route path="dashboard" element={<Navigate to="../config" replace />} />
                    <Route path="internal" element={<Navigate to="../config" replace />} />
                    <Route path="config" element={<AdminServerAppDetailPage />} />
                    <Route path="runtime" element={<AdminServerAppRuntimePage />} />
                  </Route>
                </>
              )}

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
