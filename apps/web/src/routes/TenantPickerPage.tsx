import { useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { ErrorState, EmptyState } from "../components/StatusStates.js";

export function TenantPickerPage() {
  const { state, selectTenant, logout } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  if (state.status !== "choosing_tenant") return null;

  async function onSelect(tenantId: string) {
    setSelecting(tenantId);
    setError(null);
    try {
      await selectTenant(tenantId);
    } catch (err) {
      setError(err);
      setSelecting(null);
    }
  }

  return (
    <div className="center-page">
      <div className="card auth-card stack">
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>Выберите рабочее пространство</h1>
        {error ? <ErrorState error={error} onRetry={() => setError(null)} /> : null}
        {state.memberships.length === 0 ? (
          <EmptyState label="У вас нет доступа ни к одному tenant. Обратитесь к администратору." />
        ) : (
          <div className="stack">
            {state.memberships.map((m) => (
              <button
                key={m.tenant_id}
                type="button"
                className="btn btn-secondary"
                disabled={selecting !== null}
                onClick={() => onSelect(m.tenant_id)}
              >
                {selecting === m.tenant_id ? "Вход…" : m.tenant_slug}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Выйти
        </button>
      </div>
    </div>
  );
}
