import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { AuthPage } from "./pages/AuthPage";
import { PlanTripPage } from "./pages/PlanTripPage";
import { TripDashboardPage } from "./pages/TripDashboardPage";

function AppShell() {
  const { status, user, lastTripId, logout } = useAuth();

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="site-header">
        <div>
          <p className="eyebrow">Wayfinder</p>
          <h1>Travel Planning &amp; Experience Engine</h1>
        </div>

        <nav aria-label="Primary navigation" className="primary-nav">
          <NavLink to="/plan">Plan</NavLink>
          {lastTripId ? <NavLink to={`/trips/${lastTripId}`}>Latest Trip</NavLink> : null}
          {status === "authenticated" ? (
            <button className="ghost-button" onClick={logout} type="button">
              Sign out
            </button>
          ) : (
            <NavLink to="/auth">Sign in</NavLink>
          )}
        </nav>
      </header>

      <main id="main-content" className="site-main">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/plan"
            element={
              status === "authenticated" ? (
                <PlanTripPage />
              ) : status === "checking" ? (
                <div className="page-shell" aria-busy="true">
                  <div className="skeleton-block tall" />
                </div>
              ) : (
                <Navigate replace to="/auth" />
              )
            }
          />
          <Route
            path="/trips/:tripId"
            element={
              status === "authenticated" ? (
                <TripDashboardPage />
              ) : status === "checking" ? (
                <div className="page-shell" aria-busy="true">
                  <div className="skeleton-block tall" />
                </div>
              ) : (
                <Navigate replace to="/auth" />
              )
            }
          />
          <Route path="*" element={<Navigate replace to={status === "authenticated" ? "/plan" : "/auth"} />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <p>Realtime updates use Server-Sent Events so the Vercel deployment stays serverless-compatible.</p>
        {user ? (
          <p>
            Signed in as <strong>{user.displayName}</strong>
          </p>
        ) : null}
      </footer>
    </div>
  );
}

export default AppShell;
