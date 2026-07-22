import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { ErrorState } from "../components/StatusStates.js";

export function LoginPage() {
  const { login } = useAuth();
  const [loginIdentity, setLoginIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(loginIdentity, password);
    } catch (err) {
      // UI-001: errors never reveal whether the account exists (backend already enforces
      // this — AUTH_REQUIRED is identical for unknown user vs wrong password).
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="center-page">
      <form className="card auth-card stack" onSubmit={onSubmit}>
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>Network CRM</h1>
        {error ? <ErrorState error={error} /> : null}
        <div className="field">
          <label htmlFor="login_identity">Email</label>
          <input
            id="login_identity"
            type="email"
            required
            autoComplete="username"
            value={loginIdentity}
            onChange={(e) => setLoginIdentity(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
