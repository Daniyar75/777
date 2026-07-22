import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { ErrorState } from "../components/StatusStates.js";

export function MfaPage() {
  const { verifyMfa } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyMfa(code);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="center-page">
      <form className="card auth-card stack" onSubmit={onSubmit}>
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>Код подтверждения</h1>
        <p className="state-banner muted" style={{ padding: 0 }}>
          Введите 6-значный код из приложения-аутентификатора.
        </p>
        {error ? <ErrorState error={error} /> : null}
        <div className="field">
          <label htmlFor="code">Код</label>
          <input
            id="code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Проверяем…" : "Подтвердить"}
        </button>
      </form>
    </div>
  );
}
