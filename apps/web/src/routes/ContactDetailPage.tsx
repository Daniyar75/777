import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Activity, Consent, Contact, ContactRole, ContactRoleType, TimelineEntry } from "@network-crm/contracts";
import { apiGet, apiPost } from "../api/client.js";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusStates.js";

const ROLE_TYPES: ContactRoleType[] = ["candidate", "client", "partner", "other"];

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  if (!id) return null;

  const contactQuery = useQuery({ queryKey: ["contact", id], queryFn: () => apiGet<Contact>(`/contacts/${id}`) });
  const rolesQuery = useQuery({
    queryKey: ["contact", id, "roles"],
    queryFn: () => apiGet<{ items: ContactRole[] }>(`/contacts/${id}/roles`),
  });
  const consentsQuery = useQuery({
    queryKey: ["contact", id, "consents"],
    queryFn: () => apiGet<{ items: Consent[] }>(`/contacts/${id}/consents`),
  });
  const activitiesQuery = useQuery({
    queryKey: ["contact", id, "activities"],
    queryFn: () => apiGet<{ items: Activity[] }>(`/contacts/${id}/activities`),
  });
  const timelineQuery = useQuery({
    queryKey: ["contact", id, "timeline"],
    queryFn: () => apiGet<{ items: TimelineEntry[] }>(`/contacts/${id}/timeline`),
  });

  const invalidateContact = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["contact", id] }),
      queryClient.invalidateQueries({ queryKey: ["contact", id, "timeline"] }),
    ]);

  const addRole = useMutation({
    mutationFn: (roleType: ContactRoleType) => apiPost(`/contacts/${id}/roles`, { role_type: roleType }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contact", id, "roles"] });
      void invalidateContact();
    },
  });

  const archive = useMutation({
    mutationFn: () => apiPost(`/contacts/${id}/archive`, undefined),
    onSuccess: () => void invalidateContact(),
  });

  if (contactQuery.isLoading) return <LoadingState />;
  if (contactQuery.isError) return <ErrorState error={contactQuery.error} onRetry={() => contactQuery.refetch()} />;
  if (!contactQuery.data) return null;
  const contact = contactQuery.data;

  return (
    <div className="stack">
      <div>
        <Link to="/contacts">← Контакты</Link>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>{contact.display_name}</h1>
          <span className="badge">{contact.status}</span>
        </div>
        <div className="row" style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          {contact.normalized_phone ? <span>{contact.normalized_phone}</span> : null}
          {contact.normalized_email ? <span>{contact.normalized_email}</span> : null}
          {contact.source ? <span>Источник: {contact.source}</span> : null}
        </div>
        {contact.status === "active" ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ alignSelf: "start" }}
            disabled={archive.isPending}
            onClick={() => archive.mutate()}
          >
            Архивировать
          </button>
        ) : null}
        {archive.isError ? <ErrorState error={archive.error} /> : null}
      </div>

      <RolesSection roles={rolesQuery} onAdd={(rt) => addRole.mutate(rt)} adding={addRole.isPending} addError={addRole.error} />
      <ConsentsSection contactId={id} query={consentsQuery} onRecorded={() => queryClient.invalidateQueries({ queryKey: ["contact", id, "consents"] })} />
      <ActivitiesSection
        contactId={id}
        query={activitiesQuery}
        onLogged={() => {
          void queryClient.invalidateQueries({ queryKey: ["contact", id, "activities"] });
          void invalidateContact();
        }}
      />
      <TimelineSection query={timelineQuery} />
    </div>
  );
}

function RolesSection(props: {
  roles: ReturnType<typeof useQuery<{ items: ContactRole[] }>>;
  onAdd: (roleType: ContactRoleType) => void;
  adding: boolean;
  addError: unknown;
}) {
  const { roles, onAdd, adding, addError } = props;
  return (
    <section className="card stack">
      <h2 style={{ margin: 0, fontSize: "1rem" }}>Роли (BR-001: мультироли на одном контакте)</h2>
      {roles.isLoading ? <LoadingState /> : null}
      {roles.isError ? <ErrorState error={roles.error} onRetry={() => roles.refetch()} /> : null}
      {roles.data && roles.data.items.length === 0 ? <EmptyState label="Роли ещё не назначены." /> : null}
      {roles.data && roles.data.items.length > 0 ? (
        <div className="row">
          {roles.data.items.map((r) => (
            <span key={r.id} className="badge">
              {r.role_type} ({r.status})
            </span>
          ))}
        </div>
      ) : null}
      {addError ? <ErrorState error={addError} /> : null}
      <div className="row">
        {ROLE_TYPES.map((rt) => (
          <button key={rt} type="button" className="btn btn-secondary" disabled={adding} onClick={() => onAdd(rt)}>
            + {rt}
          </button>
        ))}
      </div>
    </section>
  );
}

function ConsentsSection(props: {
  contactId: string;
  query: ReturnType<typeof useQuery<{ items: Consent[] }>>;
  onRecorded: () => void;
}) {
  const { contactId, query, onRecorded } = props;
  const [purpose, setPurpose] = useState("marketing");
  const [channel, setChannel] = useState("email");

  const record = useMutation({
    mutationFn: (status: "granted" | "withdrawn") => apiPost(`/contacts/${contactId}/consents`, { purpose, channel, status }),
    onSuccess: onRecorded,
  });

  return (
    <section className="card stack">
      <h2 style={{ margin: 0, fontSize: "1rem" }}>Согласия (SEC-011)</h2>
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
      {query.data && query.data.items.length === 0 ? <EmptyState label="Согласий пока нет." /> : null}
      {query.data && query.data.items.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Цель</th>
              <th>Канал</th>
              <th>Статус</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((c) => (
              <tr key={c.id}>
                <td>{c.purpose}</td>
                <td>{c.channel}</td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
                <td>{new Date(c.captured_at).toLocaleString("ru-RU")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {record.isError ? <ErrorState error={record.error} /> : null}
      <div className="row">
        <input placeholder="цель (marketing)" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ maxWidth: 160 }} />
        <input placeholder="канал (email)" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ maxWidth: 160 }} />
        <button type="button" className="btn btn-secondary" disabled={record.isPending} onClick={() => record.mutate("granted")}>
          Отметить согласие
        </button>
        <button type="button" className="btn btn-secondary" disabled={record.isPending} onClick={() => record.mutate("withdrawn")}>
          Отозвать
        </button>
      </div>
    </section>
  );
}

function ActivitiesSection(props: {
  contactId: string;
  query: ReturnType<typeof useQuery<{ items: Activity[] }>>;
  onLogged: () => void;
}) {
  const { contactId, query, onLogged } = props;
  const [summary, setSummary] = useState("");

  const log = useMutation({
    mutationFn: () => apiPost(`/contacts/${contactId}/activities`, { type: "note", summary }),
    onSuccess: () => {
      setSummary("");
      onLogged();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (summary.trim()) log.mutate();
  }

  return (
    <section className="card stack">
      <h2 style={{ margin: 0, fontSize: "1rem" }}>Активность</h2>
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
      {query.data && query.data.items.length === 0 ? <EmptyState label="Пока нет записей." /> : null}
      {query.data && query.data.items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {query.data.items.map((a) => (
            <li key={a.id}>
              {new Date(a.occurred_at).toLocaleString("ru-RU")} — {a.summary ?? a.type}
            </li>
          ))}
        </ul>
      ) : null}
      {log.isError ? <ErrorState error={log.error} /> : null}
      <form className="row" onSubmit={onSubmit}>
        <input
          placeholder="Заметка о звонке, встрече…"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="submit" className="btn btn-secondary" disabled={log.isPending}>
          Добавить
        </button>
      </form>
    </section>
  );
}

function TimelineSection({ query }: { query: ReturnType<typeof useQuery<{ items: TimelineEntry[] }>> }) {
  return (
    <section className="card stack">
      <h2 style={{ margin: 0, fontSize: "1rem" }}>История (FR-CONTACT-003)</h2>
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
      {query.data && query.data.items.length === 0 ? <EmptyState label="История пуста." /> : null}
      {query.data && query.data.items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {query.data.items.map((e) => (
            <li key={e.ref_id}>
              <span className="badge">{e.kind}</span> {new Date(e.occurred_at).toLocaleString("ru-RU")} — {e.summary}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
