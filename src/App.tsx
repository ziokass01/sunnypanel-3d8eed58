import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { AdminServerAppChargePage } from "@/pages/AdminServerAppCharge";
import { AdminServerAppTrashPage } from "@/pages/AdminServerAppTrash";
import { AdminServerAppKeysPage } from "@/pages/AdminServerAppKeys";
import { AdminServerAppAuditPage } from "@/pages/AdminServerAppAudit";
import { AdminServerAppControlPage } from "@/pages/AdminServerAppControl";
import { AdminServerAppRedeemPage } from "@/pages/AdminServerAppRedeem";
import { RentPortalPage } from "@/pages/RentPortal";
import { RentAdminCustomerSetupPage } from "@/pages/RentAdminCustomerSetup";
import { ServiceLandingPage } from "@/pages/ServiceLanding";
import { ResetKeyPage } from "@/pages/ResetKey";
import { ResetSettingsPage } from "@/pages/ResetSettings";
import { ResetLogsPage } from "@/pages/ResetLogs";
import { useAuth } from "@/auth/AuthProvider";
import { isAdminHostName, isAppHostName } from "@/lib/appWorkspace";
import { MobileGoogleStartPage } from "@/pages/MobileGoogleStart";
import { MobileGoogleCallbackPage } from "@/pages/MobileGoogleCallback";
import { FakeLagPortalPage } from "@/pages/FakeLagPortal";
import { AdminFakeLagLicensesPage } from "@/pages/AdminFakeLagLicenses";
const queryClient = new QueryClient();

function ControlHostEntry() {
  const { user, loading } = useAuth();
  const isAppHost = isAppHostName();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Đang kiểm tra phiên đăng nhập...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={isAppHost ? "/apps" : "/dashboard"} replace />;
}

function WorkspaceRoutes() {
  return (
    <AppWorkspaceShell />
  );
}

function LegacyFreeKeysRedirect() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const app = String(params.get("app") || "find-dumps").trim() || "find-dumps";
  return <Navigate to={`/apps/${encodeURIComponent(app)}/keys`} replace />;
}

const App = () => {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const isAdminHost = isAdminHostName(host);
  const isAppHost = isAppHostName(host);
  const isControlHost = isAdminHost || isAppHost;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={isControlHost ? <ControlHostEntry /> : <ServiceLandingPage />} />
              <Route path="/login" element={isControlHost ? <LoginPage /> : <Navigate to="/" replace />} />
              <Route path="/mobile-auth/google" element={<MobileGoogleStartPage />} />
              <Route path="/mobile-auth/callback" element={<MobileGoogleCallbackPage />} />
              <Route path="/free" element={<FreeLandingPage />} />
              <Route path="/fake-lag" element={<FakeLagPortalPage />} />
              <Route path="/free/gate" element={<FreeGatePage />} />
              <Route path="/free/gat" element={<Navigate to="/free/gate" replace />} />
              <Route path="/free/claim" element={<FreeClaimPage />} />
              <Route path="/gate" element={<Navigate to="/free/gate" replace />} />
              <Route path="/claim" element={<Navigate to="/free/claim" replace />} />
              <Route path="/clam" element={<Navigate to="/free/claim" replace />} />

              {!isControlHost && <Route path="/rent" element={<RentPortalPage />} />}
              {isAppHost && <Route path="/admin/free-keys" element={<LegacyFreeKeysRedirect />} />}
              {isAppHost && <Route path="/admin/free" element={<LegacyFreeKeysRedirect />} />}
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
                  <Route path="/apps" element={<AdminRoute><AdminServerAppsPage /></AdminRoute>} />
                  <Route
                    path="/admin/apps/:appCode"
                    element={<AdminRoute><WorkspaceRoutes /></AdminRoute>}
                  >
                    <Route index element={<Navigate to="runtime" replace />} />
                    <Route path="dashboard" element={<Navigate to="../runtime" replace />} />
                    <Route path="internal" element={<Navigate to="../config" replace />} />
                    <Route path="config" element={<AdminServerAppDetailPage />} />
                    <Route path="runtime" element={<AdminServerAppRuntimePage />} />
                    <Route path="keys" element={<AdminServerAppKeysPage />} />
                    <Route path="licenses" element={<AdminFakeLagLicensesPage />} />
                    <Route path="charge" element={<AdminServerAppChargePage />} />
                    <Route path="control" element={<AdminServerAppControlPage />} />
                    <Route path="redeem" element={<AdminServerAppRedeemPage />} />
                    <Route path="audit" element={<AdminServerAppAuditPage />} />
                    <Route path="trash" element={<AdminServerAppTrashPage />} />
                  </Route>
                  <Route
                    path="/apps/:appCode"
                    element={<AdminRoute><WorkspaceRoutes /></AdminRoute>}
                  >
                    <Route index element={<Navigate to="runtime" replace />} />
                    <Route path="dashboard" element={<Navigate to="../runtime" replace />} />
                    <Route path="internal" element={<Navigate to="../config" replace />} />
                    <Route path="config" element={<AdminServerAppDetailPage />} />
                    <Route path="runtime" element={<AdminServerAppRuntimePage />} />
                    <Route path="keys" element={<AdminServerAppKeysPage />} />
                    <Route path="licenses" element={<AdminFakeLagLicensesPage />} />
                    <Route path="charge" element={<AdminServerAppChargePage />} />
                    <Route path="control" element={<AdminServerAppControlPage />} />
                    <Route path="redeem" element={<AdminServerAppRedeemPage />} />
                    <Route path="audit" element={<AdminServerAppAuditPage />} />
                    <Route path="trash" element={<AdminServerAppTrashPage />} />
                  </Route>
                  <Route path="/rent" element={<AdminRoute><RentAdminCustomerSetupPage /></AdminRoute>} />
                  <Route path="/settings/reset-key" element={<AdminRoute><ResetSettingsPage /></AdminRoute>} />
                  <Route path="/settings/reset-logs" element={<AdminRoute><ResetLogsPage /></AdminRoute>} />
                </Route>
              )}

              {isAppHost && (
                <>
                  <Route
                    path="/apps"
                    element={
                      <AuthGate>
                        <PanelRoute>
                          <AdminRoute>
                            <AdminServerAppsPage />
                          </AdminRoute>
                        </PanelRoute>
                      </AuthGate>
                    }
                  />
                  <Route
                    path="/apps/:appCode"
                    element={
                      <AuthGate>
                        <PanelRoute>
                          <AdminRoute>
                            <WorkspaceRoutes />
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
                    <Route path="keys" element={<AdminServerAppKeysPage />} />
                    <Route path="licenses" element={<AdminFakeLagLicensesPage />} />
                    <Route path="charge" element={<AdminServerAppChargePage />} />
                    <Route path="control" element={<AdminServerAppControlPage />} />
                    <Route path="redeem" element={<AdminServerAppRedeemPage />} />
                    <Route path="audit" element={<AdminServerAppAuditPage />} />
                    <Route path="trash" element={<AdminServerAppTrashPage />} />
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
