import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClientError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

type AuthMode = "login" | "register";

export function AuthPage() {
  const navigate = useNavigate();
  const { login, register, status } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({
    email: "",
    password: "",
    displayName: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });

  const statusId = useId();

  useEffect(() => {
    if (status === "authenticated") {
      navigate("/plan", { replace: true });
    }
  }, [navigate, status]);

  const mutation = useMutation({
    mutationFn: async () => {
      const nextErrors: Record<string, string> = {};
      if (!values.email.trim()) {
        nextErrors.email = "Email is required.";
      }
      if (!values.password.trim()) {
        nextErrors.password = "Password is required.";
      }
      if (mode === "register" && !values.displayName.trim()) {
        nextErrors.displayName = "Display name is required.";
      }

      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        throw new Error("Client validation failed.");
      }

      if (mode === "login") {
        await login({ email: values.email, password: values.password });
      } else {
        await register({
          email: values.email,
          password: values.password,
          displayName: values.displayName,
          timezone: values.timezone,
        });
      }
    },
  });

  return (
    <section className="page-shell auth-shell">
      <aside className="panel narrative-panel">
        <p className="eyebrow">Ready to build</p>
        <h2>Travel plans that react when the world changes.</h2>
        <p>
          Sign in to set your travel preferences, build a constraint-aware trip, and watch the itinerary react to realtime events without losing accessibility context.
        </p>
        <ul className="feature-list">
          <li>Constraint-first planning with typed travel preferences</li>
          <li>Server-Sent Events for closures, price shifts, and weather changes</li>
          <li>Accessible itinerary review with keyboard-first navigation</li>
        </ul>
      </aside>

      <section aria-labelledby="auth-heading" className="panel auth-panel">
        <h2 id="auth-heading">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="subtle-text" id={statusId}>
          {mode === "login"
            ? "Use your email and password to continue."
            : "We only ask for what we need to personalize your trip planning."}
        </p>

        <div aria-label="Authentication mode" className="tab-row" role="tablist">
          <button
            aria-selected={mode === "login"}
            className={mode === "login" ? "tab is-active" : "tab"}
            onClick={() => setMode("login")}
            role="tab"
            type="button"
          >
            Login
          </button>
          <button
            aria-selected={mode === "register"}
            className={mode === "register" ? "tab is-active" : "tab"}
            onClick={() => setMode("register")}
            role="tab"
            type="button"
          >
            Register
          </button>
        </div>

        <form
          className="stacked-form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {mode === "register" ? (
            <div className="field-group">
              <label htmlFor="displayName">Display name</label>
              <input
                aria-describedby={errors.displayName ? "displayName-error" : undefined}
                aria-invalid={Boolean(errors.displayName)}
                id="displayName"
                onChange={(event) => setValues((current) => ({ ...current, displayName: event.target.value }))}
                value={values.displayName}
              />
              {errors.displayName ? (
                <p className="field-error" id="displayName-error">
                  {errors.displayName}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="field-group">
            <label htmlFor="email">Email</label>
            <input
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              id="email"
              onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
              type="email"
              value={values.email}
            />
            {errors.email ? (
              <p className="field-error" id="email-error">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input
              aria-describedby={errors.password ? "password-error" : "password-help"}
              aria-invalid={Boolean(errors.password)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              id="password"
              onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
              type="password"
              value={values.password}
            />
            <p className="field-help" id="password-help">
              Use at least 10 characters for new accounts.
            </p>
            {errors.password ? (
              <p className="field-error" id="password-error">
                {errors.password}
              </p>
            ) : null}
          </div>

          {mode === "register" ? (
            <div className="field-group">
              <label htmlFor="timezone">Timezone</label>
              <input
                id="timezone"
                onChange={(event) => setValues((current) => ({ ...current, timezone: event.target.value }))}
                value={values.timezone}
              />
            </div>
          ) : null}

          {mutation.isError && mutation.error instanceof ApiClientError ? (
            <p className="field-error" role="alert">
              {mutation.error.message}
            </p>
          ) : null}

          <button className="primary-button" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </section>
  );
}
