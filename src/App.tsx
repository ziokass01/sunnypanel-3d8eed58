import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { AdminRoute } from "@/auth/AdminRoute";
import { AuthGate } from "@/auth/AuthGate";
import { PanelRoute } from "@/auth/PanelRoute";
import { useAuth } from "@/auth/AuthProvider";
import { isAdminHostName, isAppHostName } from "@/lib/appWorkspace";
import { lazyNamed } from "@/lib/lazyPage";
import { queryClient } from "@/lib/queryClient";
import { RouteFallback } from "@/components/RouteFallback";

const NotFound = lazy(() => import("./pages/NotFound"));
const LoginPage = lazyNamed(() => import("@/pages/Login"), "LoginPage");
const AdminShell = lazyNamed(() => import("@/shell/AdminShell"), "AdminShell");
const AppWorkspaceShell = lazyNamed(() => import("@/shell/AppWorkspaceShell"), "AppWorkspaceShell");
const DashboardPage = lazyNamed(() => import("@/pages/Dashboard"), "DashboardPage");
const LicensesListPage = lazyNamed(() => import("@/pages/LicensesList"), "LicensesListPage");
const Licenses2Page = lazyNamed(() => import("@/pages/Licenses2"), "Licenses2Page");
const FreeLicensesPage = lazyNamed(() => import("@/pages/FreeLicenses"), "FreeLicensesPage");
const LicenseCreatePage = lazyNamed(() => import("@/pages/LicenseCreate"), "LicenseCreatePage");
const LicenseDetailPage = lazyNamed(() => import("@/pages/LicenseDetail"), "LicenseDetailPage");
const LicenseEditPage = lazyNamed(() => import("@/pages/LicenseEdit"), "LicenseEditPage");
const LicensesTrashPage = lazyNamed(() => import("@/pages/LicensesTrash"), "LicensesTrashPage");
const AuditLogsPage = lazyNamed(() => import("@/pages/AuditLogs"), "AuditLogsPage");
const FreeLandingPage = lazyNamed(() => import("@/pages/FreeLanding"), "FreeLandingPage");
const FreeGatePage = lazyNamed(() => import("@/pages/FreeGate"), "FreeGatePage");
const FreeClaimPage = lazyNamed(() => import("@/pages/FreeClaim"), "FreeClaimPage");
const AdminFreeKeysPage = lazyNamed(() => import("@/pages/AdminFreeKeys"), "AdminFreeKeysPage");
const AdminServerAppsPage = lazyNamed(() => import("@/pages/AdminServerApps"), "AdminServerAppsPage");
const AdminServerAppDetailPage = lazyNamed(() => import("@/pages/AdminServerAppDetail"), "AdminServerAppDetailPage");
const AdminServerAppRuntimePage = lazyNamed(() => import("@/pages/AdminServerAppRuntime"), "AdminServerAppRuntimePage");
const AdminServerAppChargePage = lazyNamed(() => import("@/pages/AdminServerAppCharge"), "AdminServerAppChargePage");
const AdminServerAppTrashPage = lazyNamed(() => import("@/pages/AdminServerAppTrash"), "AdminServerAppTrashPage");
const AdminServerAppKeysPage = lazyNamed(() => import("@/pages/AdminServerAppKeys"), "AdminServerAppKeysPage");
const AdminServerAppAuditPage = lazyNamed(() => import("@/pages/AdminServerAppAudit"), "AdminServerAppAuditPage");
const RentPortalPage = lazyNamed(() => import("@/pages/RentPortal"), "RentPortalPage");
const RentAdminCustomerSetupPage = lazyNamed(() => import("@/pages/RentAdminCustomerSetup"), "RentAdminCustomerSetupPage");
const ServiceLandingPage = lazyNamed(() => import("@/pages/ServiceLanding"), "ServiceLandingPage");
const ResetKeyPage = lazyNamed(() => import("@/pages/ResetKey"), "ResetKeyPage");
const ResetSettingsPage = lazyNamed(() => import("@/pages/ResetSettings"), "ResetSettingsPage");
const ResetLogsPage = lazyNamed(() => import("@/pages/ResetLogs"), "ResetLogsPage");
const MobileGoogleStartPage = lazyNamed(() => import("@/pages/MobileGoogleStart"), "MobileGoogleStartPage");
const MobileGoogleCallbackPage = lazyNamed(() => import("@/pages/MobileGoogleCallback"), "MobileGoogleCallbackPage");

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

const workspaceChildren = (
  <>
    <Route index element={<Navigate to="runtime" replace />} />
    <Route path="dashboard" element={<Navigate to="../runtime" replace />} />
    <Route path="internal" element={<Navigate to="../config" replace />} />
    <Route path="config" element={<AdminServerAppDetailPage />} />
    <Route path="runtime" element={<AdminServerAppRuntimePage />} />
    <Route path="keys" element={<AdminServerAppKeysPage />} />
    <Route path="charge" element={<AdminServerAppChargePage />} />
    <Route path="audit" element={<AdminServerAppAuditPage />} />
    <Route path="trash" element={<AdminServerAppTrashPage />} />
  </>
);

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
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={isControlHost ? <ControlHostEntry /> : <ServiceLandingPage />} />
                <Route path="/login" element={isControlHost ? <LoginPage /> : <Navigate to="/" replace />} />
                <Route path="/mobile-auth/google" element={<MobileGoogleStartPage />} />
                <Route path="/mobile-auth/callback" element={<MobileGoogleCallbackPage />} />
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
                    <Route path="/apps" element={<AdminRoute><AdminServerAppsPage /></AdminRoute>} />
                    <Route path="/admin/apps/:appCode" element={<AdminRoute><AppWorkspaceShell /></AdminRoute>}>
                      {workspaceChildren}
                    </Route>
                    <Route path="/apps/:appCode" element={<AdminRoute><AppWorkspaceShell /></AdminRoute>}>
                      {workspaceChildren}
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
                              <AppWorkspaceShell />
                            </AdminRoute>
                          </PanelRoute>
                        </AuthGate>
                      }
                    >
                      {workspaceChildren}
                    </Route>
                  </>
                )}

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
