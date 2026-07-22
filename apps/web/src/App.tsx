import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.js";
import { LoginPage } from "./routes/LoginPage.js";
import { MfaPage } from "./routes/MfaPage.js";
import { TenantPickerPage } from "./routes/TenantPickerPage.js";
import { AppLayout } from "./routes/AppLayout.js";
import { DashboardPage } from "./routes/DashboardPage.js";
import { ContactsListPage } from "./routes/ContactsListPage.js";
import { ContactDetailPage } from "./routes/ContactDetailPage.js";
import { ImportContactsPage } from "./routes/ImportContactsPage.js";
import { TasksListPage } from "./routes/TasksListPage.js";

/**
 * Top-level routing branches on auth state rather than a RequireAuth wrapper per route —
 * with only four states (booting/unauthenticated/mfa/choosing-tenant/authenticated) and no
 * per-route permission differences yet (that's server-enforced, ADR-0004), a single switch
 * is simpler than route-level guards and cannot be bypassed by navigating directly to a URL.
 */
export function App() {
  const { state } = useAuth();

  if (state.status === "booting") {
    return <div className="center-page">Загрузка сессии…</div>;
  }
  if (state.status === "unauthenticated") {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (state.status === "mfa_required") {
    return (
      <Routes>
        <Route path="*" element={<MfaPage />} />
      </Routes>
    );
  }
  if (state.status === "choosing_tenant") {
    return (
      <Routes>
        <Route path="*" element={<TenantPickerPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/contacts" element={<ContactsListPage />} />
        <Route path="/contacts/import" element={<ImportContactsPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/tasks" element={<TasksListPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
