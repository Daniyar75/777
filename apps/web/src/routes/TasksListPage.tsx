import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskRequest, Task, TaskPriority } from "@network-crm/contracts";
import { apiGet, apiPost } from "../api/client.js";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusStates.js";

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

/** UI-013 Tasks: list, create, complete (BL-207). */
export function TasksListPage() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => apiGet<{ items: Task[]; next_cursor: string | null }>("/tasks"),
  });

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskRequest) => apiPost<Task>("/tasks", input),
    onSuccess: () => {
      setTitle("");
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => apiPost<Task>(`/tasks/${taskId}/complete`, undefined),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate({ title, priority });
  }

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Задачи</h1>

      <form className="card row" onSubmit={onSubmit}>
        <div className="field" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
          <label htmlFor="title">Новая задача</label>
          <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="priority">Приоритет</label>
          <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn" disabled={createMutation.isPending}>
          Создать
        </button>
      </form>
      {createMutation.isError ? <ErrorState error={createMutation.error} /> : null}

      {listQuery.isLoading ? <LoadingState /> : null}
      {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} /> : null}
      {listQuery.data && listQuery.data.items.length === 0 ? <EmptyState label="Задач пока нет." /> : null}
      {listQuery.data && listQuery.data.items.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Приоритет</th>
              <th>Статус</th>
              <th>Срок</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {listQuery.data.items.map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>
                  <span className="badge">{t.priority}</span>
                </td>
                <td>
                  <span className="badge">{t.status}</span>
                </td>
                <td>{t.due_at ? new Date(t.due_at).toLocaleDateString("ru-RU") : "—"}</td>
                <td>
                  {t.status !== "done" && t.status !== "cancelled" ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(t.id)}
                    >
                      Завершить
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {completeMutation.isError ? <ErrorState error={completeMutation.error} /> : null}
    </div>
  );
}
