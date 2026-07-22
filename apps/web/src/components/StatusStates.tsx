import { HttpError } from "../api/client.js";

/**
 * Shared building blocks for the six-state UI contract every screen must implement
 * (docs/requirements/functional-requirements.md §13: loading, empty, permission-denied,
 * validation-error, transient-error+retry). Screens compose these instead of each inventing
 * its own error copy.
 */

export function LoadingState({ label = "Загрузка…" }: { label?: string }) {
  return <div className="state-banner muted">{label}</div>;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="state-banner muted">{label}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = describeError(error);
  const isPermissionDenied = error instanceof HttpError && error.status === 403;
  return (
    <div className="state-banner error stack">
      <span>{isPermissionDenied ? "Недостаточно прав для этого действия." : message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export function describeError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.body.field_errors?.length) {
      return error.body.field_errors.map((f) => `${f.field}: ${f.message ?? f.code}`).join("; ");
    }
    return error.body.message;
  }
  if (error instanceof Error) return error.message;
  return "Произошла непредвиденная ошибка.";
}
