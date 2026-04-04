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
import { RentPortalPage } from "@/pages/RentPortal";
import { RentAdminCustomerSetupPage } from "@/pages/RentAdminCustomerSetup";
import { ServiceLandingPage } from "@/pages/ServiceLanding";
import { ResetKeyPage } from "@/pages/ResetKey";
import { ResetSettingsPage } from "@/pages/ResetSettings";
import { ResetLogsPage } from "@/pages/ResetLogs";

const queryClient = new QueryClient();

const App = () => {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const adminHosts = (import.meta.env.VITE_ADMIN_HOSTS ?? "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  const isAdminHost = host.startsWith("admin.") || adminHosts.includes(host);

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
                element={isAdminHost ? <Navigate to="/login" replace /> : <ServiceLandingPage />}
              />

              <Route
                path="/login"
                element={isAdminHost ? <LoginPage /> : <Navigate to="/" replace />}
              />

              <Route path="/free" element={<FreeLandingPage />} />
              <Route path="/free/gate" element={<FreeGatePage />} />
              <Route path="/free/gat" element={<Navigate to="/free/gate" replace />} />
              <Route path="/free/claim" element={<FreeClaimPage />} />
              <Route path="/gate" element={<Navigate to="/free/gate" replace />} />
              <Route path="/claim" element={<Navigate to="/free/claim" replace />} />
              <Route path="/clam" element={<Navigate to="/free/claim" replace />} />

              {!isAdminHost && <Route path="/rent" element={<RentPortalPage />} />}
              {!isAdminHost && <Route path="/reset-key" element={<ResetKeyPage />} />}

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
                  <Route path="/rent" element={<AdminRoute><RentAdminCustomerSetupPage /></AdminRoute>} />
                  <Route path="/settings/reset-key" element={<AdminRoute><ResetSettingsPage /></AdminRoute>} />
                  <Route path="/settings/reset-logs" element={<AdminRoute><ResetLogsPage /></AdminRoute>} />
                </Route>
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
