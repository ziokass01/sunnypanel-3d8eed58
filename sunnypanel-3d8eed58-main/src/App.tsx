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
import { RentAdminPage } from "@/pages/RentAdmin";
import { RentPortalPage } from "@/pages/RentPortal";
import { ServiceLandingPage } from "@/pages/ServiceLanding";

const queryClient = new QueryClient();

const App = () => {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  // Allow deploying the same build to both user + admin domains.
  // Default: treat any "admin.<domain>" as admin.
  // Optional: set VITE_ADMIN_HOSTS to a comma-separated list of exact hostnames.
  const adminHosts = (import.meta.env.VITE_ADMIN_HOSTS ?? "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  // Default admin detection: any "admin.<domain>" OR explicit hostnames in VITE_ADMIN_HOSTS.
  const isAdminHost = host.startsWith("admin.") || adminHosts.includes(host);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Root routing: admin domain -> /login, user domain -> landing (2 nút) */}
            <Route
              path="/"
              element={isAdminHost ? <Navigate to="/login" replace /> : <ServiceLandingPage />}
            />

            {/* Login chỉ dành cho admin domain. User domain vào /login sẽ quay về / */}
            <Route
              path="/login"
              element={isAdminHost ? <LoginPage /> : <Navigate to="/" replace />}
            />

            {/* Public free-key flow (outsiders use this, NOT the login page) */}
            <Route path="/free" element={<FreeLandingPage />} />
            <Route path="/free/gate" element={<FreeGatePage />} />
            {/* Safety alias for common typo */}
            <Route path="/free/gat" element={<Navigate to="/free/gate" replace />} />
            <Route path="/free/claim" element={<FreeClaimPage />} />
            {/* Short aliases (legacy links) */}
            <Route path="/gate" element={<Navigate to="/free/gate" replace />} />
            <Route path="/claim" element={<Navigate to="/free/claim" replace />} />
            <Route path="/clam" element={<Navigate to="/free/claim" replace />} />

            {/* Rent portal: user (mityangho.id.vn) */}
            {!isAdminHost && <Route path="/rent" element={<RentPortalPage />} />}

            {/* Admin-only pages: only available on admin host */}
            {isAdminHost && (
              <Route
                element={
                  <AuthGate>
                    <AdminRoute>
                      <AdminShell />
                    </AdminRoute>
                  </AuthGate>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/licenses" element={<LicensesListPage />} />
                <Route path="/licenses2" element={<Licenses2Page />} />
                <Route path="/free-licenses" element={<FreeLicensesPage />} />
                <Route path="/licenses/trash" element={<LicensesTrashPage />} />
                <Route path="/licenses/new" element={<LicenseCreatePage />} />
                <Route path="/licenses2/new" element={<LicenseCreatePage />} />
                <Route path="/licenses/:id" element={<LicenseDetailPage />} />
                <Route path="/licenses/:id/edit" element={<LicenseEditPage />} />
                <Route path="/audit" element={<AuditLogsPage />} />
                <Route path="/admin/free-keys" element={<AdminFreeKeysPage />} />
                <Route path="/rent" element={<RentAdminPage />} />
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