import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "@/auth/AuthProvider";
import { LoginPage } from "@/pages/Login";
import { AdminRoute } from "@/auth/AdminRoute";
import { AuthGate } from "@/auth/AuthGate";
import { AdminShell } from "@/shell/AdminShell";
import { DashboardPage } from "@/pages/Dashboard";
import { LicensesListPage } from "@/pages/LicensesList";
import { Licenses2Page } from "@/pages/Licenses2";
import { LicenseCreatePage } from "@/pages/LicenseCreate";
import { LicenseDetailPage } from "@/pages/LicenseDetail";
import { LicenseEditPage } from "@/pages/LicenseEdit";
import { LicensesTrashPage } from "@/pages/LicensesTrash";
import { AuditLogsPage } from "@/pages/AuditLogs";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
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
              <Route path="/licenses/trash" element={<LicensesTrashPage />} />
              <Route path="/licenses/new" element={<LicenseCreatePage />} />
              <Route path="/licenses/:id" element={<LicenseDetailPage />} />
              <Route path="/licenses/:id/edit" element={<LicenseEditPage />} />
              <Route path="/audit" element={<AuditLogsPage />} />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
