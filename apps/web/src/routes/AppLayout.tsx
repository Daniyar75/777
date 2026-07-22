import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

/** UI-003 Home shell: nav + logout, matching docs/ui/information-architecture.md's role-filtered nav shape (Stage 1-2 scope only: Contacts, Tasks). */
export function AppLayout() {
  const { logout, state } = useAuth();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div style={{ fontWeight: 700, padding: "6px 10px 14px" }}>Network CRM</div>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : undefined)}>
          Главная
        </NavLink>
        <NavLink to="/contacts" className={({ isActive }) => (isActive ? "active" : undefined)}>
          Контакты
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : undefined)}>
          Задачи
        </NavLink>
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          {state.status === "authenticated" ? (
            <div className="state-banner muted" style={{ padding: "0 10px 8px" }}>
              {state.roleCodes.join(", ") || "без роли"}
            </div>
          ) : null}
          <button type="button" className="btn btn-secondary" style={{ width: "100%" }} onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
