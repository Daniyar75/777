import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Contact, Task } from "@network-crm/contracts";
import { apiGet } from "../api/client.js";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusStates.js";

/**
 * UI-003 Home, reduced to what Stage 1-2's backend can actually answer: recent contacts and
 * open tasks. FR-DASH-001's fuller widget set (funnels, sales, network signals, ...) waits
 * for the modules that produce that data.
 */
export function DashboardPage() {
  const contacts = useQuery({
    queryKey: ["dashboard", "contacts"],
    queryFn: () => apiGet<{ items: Contact[] }>("/contacts?page_size=5"),
  });
  const tasks = useQuery({
    queryKey: ["dashboard", "tasks"],
    queryFn: () => apiGet<{ items: Task[] }>("/tasks?page_size=5"),
  });

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Главная</h1>

      <section className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Недавние контакты</h2>
          <Link to="/contacts">Все контакты →</Link>
        </div>
        {contacts.isLoading ? <LoadingState /> : null}
        {contacts.isError ? <ErrorState error={contacts.error} onRetry={() => contacts.refetch()} /> : null}
        {contacts.data && contacts.data.items.length === 0 ? <EmptyState label="Контактов пока нет." /> : null}
        {contacts.data && contacts.data.items.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {contacts.data.items.map((c) => (
              <li key={c.id}>
                <Link to={`/contacts/${c.id}`}>{c.display_name}</Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Мои задачи</h2>
          <Link to="/tasks">Все задачи →</Link>
        </div>
        {tasks.isLoading ? <LoadingState /> : null}
        {tasks.isError ? <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} /> : null}
        {tasks.data && tasks.data.items.length === 0 ? <EmptyState label="Задач пока нет." /> : null}
        {tasks.data && tasks.data.items.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {tasks.data.items.map((t) => (
              <li key={t.id}>
                {t.title} <span className="badge">{t.status}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
