import { lazy, Suspense, type ReactNode } from "react";
import { AppProviders } from "../providers";

const AdminDashboard = lazy(() =>
  import("@/src/widgets/admin-dashboard").then((module) => ({
    default: module.AdminDashboard,
  })),
);

function RouteFallback() {
  return (
    <main className="login-page" data-testid="app-route-loading">
      Загружаем защищённую админку…
    </main>
  );
}

function NotFound() {
  return (
    <main className="login-page" data-testid="app-not-found">
      <section className="access-card">
        <h1>Страница не найдена</h1>
        <p>Проверьте адрес или вернитесь в центр управления.</p>
        <a
          className="primary-button link-button"
          data-testid="app-not-found-home"
          href="/"
        >
          Открыть админку
        </a>
      </section>
    </main>
  );
}

function resolveRoute(pathname: string): ReactNode {
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";

  if (normalizedPath === "/") return <AdminDashboard />;
  return <NotFound />;
}

export function App() {
  return (
    <AppProviders>
      <Suspense fallback={<RouteFallback />}>
        {resolveRoute(window.location.pathname)}
      </Suspense>
    </AppProviders>
  );
}
