import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Contact, CreateContactRequest, DuplicateCandidate } from "@network-crm/contracts";
import { apiGet, apiPost, HttpError } from "../api/client.js";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusStates.js";

/** UI-004 Contacts: list + create, including the ACC-001 duplicate-review flow. */
export function ContactsListPage() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: () => apiGet<{ items: Contact[]; next_cursor: string | null }>("/contacts"),
  });

  const [form, setForm] = useState({ display_name: "", phone: "", email: "" });
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  const createMutation = useMutation({
    mutationFn: (input: CreateContactRequest) => apiPost<Contact>("/contacts", input),
    onSuccess: () => {
      setForm({ display_name: "", phone: "", email: "" });
      setDuplicates(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err) => {
      if (err instanceof HttpError && err.body.code === "DUPLICATE_CONTACT") {
        const details = err.body.details as { candidates?: DuplicateCandidate[] } | undefined;
        setDuplicates(details?.candidates ?? []);
        return;
      }
      setFormError(err);
    },
  });

  function submit(e: FormEvent, confirmDespiteDuplicates = false) {
    e.preventDefault();
    setFormError(null);
    if (!confirmDespiteDuplicates) setDuplicates(null);
    createMutation.mutate({
      display_name: form.display_name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      confirm_despite_duplicates: confirmDespiteDuplicates,
    });
  }

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Контакты</h1>

      <form className="card stack" onSubmit={(e) => submit(e)}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Новый контакт</h2>
        {formError ? <ErrorState error={formError} /> : null}
        <div className="row">
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="display_name">Имя</label>
            <input
              id="display_name"
              required
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="phone">Телефон</label>
            <input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
        </div>

        {duplicates && duplicates.length > 0 ? (
          <div className="state-banner error stack">
            <strong>Возможные дубли (BRULE-CONTACT-003):</strong>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {duplicates.map((d) => (
                <li key={d.contact_id}>
                  <Link to={`/contacts/${d.contact_id}`}>{d.display_name}</Link> — совпало по:{" "}
                  {d.matched_on.join(", ")}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary" onClick={(e) => submit(e, true)}>
              Всё равно создать
            </button>
          </div>
        ) : null}

        <button type="submit" className="btn" disabled={createMutation.isPending} style={{ alignSelf: "start" }}>
          {createMutation.isPending ? "Создаём…" : "Создать контакт"}
        </button>
      </form>

      {listQuery.isLoading ? <LoadingState /> : null}
      {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} /> : null}
      {listQuery.data && listQuery.data.items.length === 0 ? (
        <EmptyState label="Контактов пока нет — создайте первый выше." />
      ) : null}
      {listQuery.data && listQuery.data.items.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.data.items.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/contacts/${c.id}`}>{c.display_name}</Link>
                </td>
                <td>{c.normalized_phone ?? "—"}</td>
                <td>{c.normalized_email ?? "—"}</td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
