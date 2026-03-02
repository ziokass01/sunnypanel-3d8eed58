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

const queryClient = new QueryClient();

const App = () => {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const isAdminHost = host.startsWith("admin.");

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {isAdminHost ? (
              <>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<LoginPage />} />

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
            </Route>

                <Route path="*" element={<NotFound />} />
              </>
            ) : (
              <>
                <Route path="/" element={<Navigate to="/free" replace />} />
                {/* Don't expose admin login on the user host */}
                <Route path="/login" element={<Navigate to="/free" replace />} />

                {/* Public free-key flow (add-only) */}
                <Route path="/free" element={<FreeLandingPage />} />
                <Route path="/free/gate" element={<FreeGatePage />} />
                {/* Safety alias for common typo */}
                <Route path="/free/gat" element={<Navigate to="/free/gate" replace />} />
                <Route path="/free/claim" element={<FreeClaimPage />} />

                <Route path="*" element={<NotFound />} />
              </>
            )}
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
};

export default App;
