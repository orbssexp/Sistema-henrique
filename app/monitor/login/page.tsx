"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <div className="wrap login-wrap">
      <header>
        <div className="kicker">Área do monitor</div>
        <h1>Entrar</h1>
      </header>

      <form action={formAction}>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>

        {state.error && (
          <div className="error-msg show" role="alert">
            {state.error}
          </div>
        )}

        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Verificando..." : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
