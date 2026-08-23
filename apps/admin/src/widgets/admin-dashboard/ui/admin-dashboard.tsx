import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { roleLabels } from "@/src/entities/order";
import {
  canReceiveNewOrderAlerts,
  NewOrderAlert,
} from "@/src/features/new-order-alert";
import { OtpLoginCard } from "@/src/features/otp-login";
import { canAccessAdminPortal, useSession } from "@/src/shared/auth";
import { BrandLogo } from "@/src/shared/ui";
import {
  navigationForRole,
  type AdminNavIconName,
} from "../model/admin-navigation";

function NavIcon({ name }: { name: AdminNavIconName }) {
  const paths: Record<AdminNavIconName, ReactNode> = {
    orders: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3h6v3H9zM9 11h6M9 15h4" /></>,
    map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3zM9 3v15M15 6v15" /></>,
    branches: <><path d="M4 21V5l8-3 8 3v16M8 21v-5h8v5M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" /></>,
    delivery: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    catalog: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h8M8 11h8" /></>,
    marketing: <><path d="m3 11 16-6v14L3 13zM3 13v5a3 3 0 0 0 3 3h1l1-7M19 9c1.5.6 2 1.5 2 3s-.5 2.4-2 3" /></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    staff: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.65" /></>,
    contacts: <><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1zM20 14h-3v5h2a1 1 0 0 0 1-1zM17 19c0 2-2 3-5 3h-2" /></>,
    "login-attempts": <><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7v5l3 2M15 3h6v6" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      {paths[name]}
    </svg>
  );
}

function initials(firstName: string | null, lastName: string | null) {
  const value = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`;
  return value || "A7";
}

export function AdminDashboard() {
  const { session, ready, logout } = useSession();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const navigate = useNavigate();

  const openOrders = useCallback(() => {
    void navigate("/orders");
    setIsNavigationOpen(false);
  }, [navigate]);

  useEffect(() => {
    if (!isNavigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsNavigationOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isNavigationOpen]);

  if (!ready) {
    return (
      <main className="login-page" data-testid="admin-session-loading">
        Проверяем защищённую сессию…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="login-page" data-testid="admin-login">
        <div className="login-brand">
          <BrandLogo className="brand-logo brand-logo--login" />
          <div>
            <h1>A7-tagam Operations</h1>
            <p>Управление заказами, доставкой и кассой</p>
          </div>
        </div>
        <OtpLoginCard
          title="Вход сотрудника"
          description="Вход доступен администраторам и бухгалтерам."
        />
      </main>
    );
  }

  if (!canAccessAdminPortal(session.user.role)) {
    return (
      <main className="login-page" data-testid="admin-access-denied">
        <div className="access-card">
          <h1>Нет доступа к админке</h1>
          <p>
            Для роли «{roleLabels[session.user.role]}» вход закрыт. Веб-админка
            доступна только администраторам и бухгалтерам.
          </p>
          {session.user.role === "COURIER" && (
            <Link
              className="primary-button link-button"
              data-testid="admin-open-courier-screen"
              to="/courier"
            >
              Открыть экран курьера
            </Link>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={() => void logout()}
          >
            Выйти
          </button>
        </div>
      </main>
    );
  }

  const visibleNav = navigationForRole(session.user.role);
  const userName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") ||
    session.user.phone;

  return (
    <div className="app-shell integrated-shell" data-testid="admin-dashboard">
      {isNavigationOpen && (
        <button
          type="button"
          className="drawer-scrim"
          data-testid="admin-navigation-scrim"
          aria-label="Закрыть меню"
          onClick={() => setIsNavigationOpen(false)}
        />
      )}
      <aside className={`sidebar ${isNavigationOpen ? "drawer-open" : ""}`}>
        <Link
          className="brand"
          data-testid="admin-brand-home"
          to="/orders"
          onClick={() => setIsNavigationOpen(false)}
        >
          <BrandLogo />
          <span>
            <strong>A7-tagam</strong>
            <small>Operations</small>
          </span>
        </Link>
        <p className="nav-caption">Управление</p>
        <nav className="main-nav" aria-label="Разделы админки">
          {visibleNav.map((item) => (
            <NavLink
              key={item.id}
              className={({ isActive }) => (isActive ? "active" : undefined)}
              aria-label={item.label}
              data-testid={`admin-nav-${item.id}`}
              end
              to={item.path}
              onClick={() => setIsNavigationOpen(false)}
            >
              <span className="nav-icon"><NavIcon name={item.icon} /></span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          <div>
            <strong>Backend подключён</strong>
            <small>PostgreSQL · Redis · S3</small>
          </div>
        </div>
        <div className="sidebar-user">
          <span className="avatar">
            {initials(session.user.firstName, session.user.lastName)}
          </span>
          <div>
            <strong>{userName}</strong>
            <small>{roleLabels[session.user.role]}</small>
          </div>
          <button
            type="button"
            aria-label="Выйти"
            onClick={() => void logout()}
          >
            ↗
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <button
          type="button"
          className="mobile-nav-toggle"
          data-testid="admin-navigation-toggle"
          aria-label="Открыть меню"
          aria-expanded={isNavigationOpen}
          onClick={() => setIsNavigationOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        {canReceiveNewOrderAlerts(session.user.role) && (
          <div className="new-order-alert-slot">
            <NewOrderAlert onOpenOrders={openOrders} />
          </div>
        )}
        <Suspense
          fallback={<div className="async-state">Загружаем раздел…</div>}
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
