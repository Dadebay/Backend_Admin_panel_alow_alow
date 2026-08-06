import { lazy, Suspense, useState, type ReactNode } from "react";
import { roleLabels, type Role } from "@/src/entities/order";
import { OtpLoginCard } from "@/src/features/otp-login";
import { useSession } from "@/src/shared/auth";

const OrderBoard = lazy(() =>
  import("@/src/widgets/order-board").then((module) => ({
    default: module.OrderBoard,
  })),
);
const DispatchMap = lazy(() =>
  import("@/src/widgets/dispatch-map").then((module) => ({
    default: module.DispatchMap,
  })),
);
const CatalogManager = lazy(() =>
  import("@/src/widgets/catalog-manager").then((module) => ({
    default: module.CatalogManager,
  })),
);
const MarketingManager = lazy(() =>
  import("@/src/widgets/marketing-manager").then((module) => ({
    default: module.MarketingManager,
  })),
);
const NotificationManager = lazy(() =>
  import("@/src/widgets/notification-manager").then((module) => ({
    default: module.NotificationManager,
  })),
);
const StaffManager = lazy(() =>
  import("@/src/widgets/staff-manager").then((module) => ({
    default: module.StaffManager,
  })),
);
const CashBoard = lazy(() =>
  import("@/src/widgets/cash-board").then((module) => ({
    default: module.CashBoard,
  })),
);
const BranchManager = lazy(() =>
  import("@/src/widgets/branch-manager").then((module) => ({
    default: module.BranchManager,
  })),
);
const ContactManager = lazy(() =>
  import("@/src/widgets/contact-manager").then((module) => ({
    default: module.ContactManager,
  })),
);
const LoginAttemptManager = lazy(() =>
  import("@/src/widgets/login-attempt-manager").then((module) => ({ default: module.LoginAttemptManager })),
);

type View =
  | "orders"
  | "kitchen"
  | "map"
  | "branches"
  | "catalog"
  | "marketing"
  | "notifications"
  | "staff"
  | "cash"
  | "contacts"
  | "login-attempts";

type NavIconName =
  | "orders"
  | "kitchen"
  | "map"
  | "branches"
  | "catalog"
  | "marketing"
  | "notifications"
  | "staff"
  | "cash"
  | "contacts"
  | "login-attempts";

const nav: Array<{
  id: View;
  label: string;
  icon: NavIconName;
  roles: Role[];
}> = [
  {
    id: "login-attempts",
    label: "Попытки входа",
    icon: "login-attempts",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "orders",
    label: "Заказы",
    icon: "orders",
    roles: [
      "OPERATOR",
      "COOK",
      "COURIER",
      "ACCOUNTANT",
      "ADMIN",
      "SUPER_ADMIN",
    ],
  },
  {
    id: "kitchen",
    label: "Кухня",
    icon: "kitchen",
    roles: ["COOK", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "map",
    label: "Карта курьеров",
    icon: "map",
    roles: ["OPERATOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "branches",
    label: "Филиалы",
    icon: "branches",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "catalog",
    label: "Каталог кафе",
    icon: "catalog",
    roles: ["OPERATOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "marketing",
    label: "Маркетинг",
    icon: "marketing",
    roles: ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "notifications",
    label: "Уведомления",
    icon: "notifications",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "staff",
    label: "Команда",
    icon: "staff",
    roles: ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "cash",
    label: "Наличные",
    icon: "cash",
    roles: ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "contacts",
    label: "Контакты",
    icon: "contacts",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, ReactNode> = {
    orders: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3h6v3H9zM9 11h6M9 15h4" /></>,
    kitchen: <><path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M17 3v18M17 3c2.5 1.8 2.5 5.2 0 7" /></>,
    map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3zM9 3v15M15 6v15" /></>,
    branches: <><path d="M4 21V5l8-3 8 3v16M8 21v-5h8v5M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" /></>,
    catalog: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h8M8 11h8" /></>,
    marketing: <><path d="m3 11 16-6v14L3 13zM3 13v5a3 3 0 0 0 3 3h1l1-7M19 9c1.5.6 2 1.5 2 3s-.5 2.4-2 3" /></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    staff: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.65" /></>,
    cash: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>,
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
  return value || "AA";
}

export function AdminDashboard() {
  const { session, ready, logout } = useSession();
  const [view, setView] = useState<View>("orders");
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

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
          <span className="brand-mark">A</span>
          <div>
            <h1>AlowAlow Operations</h1>
            <p>Единая админка кафе, кухни, доставки и кассы</p>
          </div>
        </div>
        <OtpLoginCard
          title="Вход сотрудника"
          description="Одноразовый код отправляется SMS через backend."
        />
      </main>
    );
  }

  if (session.user.role === "CUSTOMER") {
    return (
      <main className="login-page" data-testid="admin-access-denied">
        <div className="access-card">
          <h1>Нет доступа к админке</h1>
          <p>
            Номер зарегистрирован как клиент. Администратор должен добавить его
            в разделе «Команда».
          </p>
          <button className="secondary-button" onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </main>
    );
  }

  if (session.user.role === "COURIER") {
    return (
      <main className="login-page" data-testid="admin-courier-entry">
        <div className="access-card">
          <h1>Экран курьера</h1>
          <p>
            Включите передачу GPS и работайте со всеми назначенными заказами.
          </p>
          <a
            className="primary-button link-button"
            data-testid="admin-open-courier"
            href="/courier"
          >
            Открыть приложение курьера
          </a>
          <button className="text-button" onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </main>
    );
  }

  const visibleNav = nav.filter((item) =>
    item.roles.includes(session.user.role),
  );
  const activeView = visibleNav.some((item) => item.id === view)
    ? view
    : (visibleNav[0]?.id ?? "orders");
  const userName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") ||
    session.user.phone;

  return (
    <div className="app-shell integrated-shell" data-testid="admin-dashboard">
      {isNavigationOpen && (
        <button
          className="drawer-scrim"
          aria-label="Закрыть меню"
          onClick={() => setIsNavigationOpen(false)}
        />
      )}
      <aside className={`sidebar ${isNavigationOpen ? "drawer-open" : ""}`}>
        <button className="brand" onClick={() => {
          setView("orders");
          setIsNavigationOpen(false);
        }}>
          <span className="brand-mark">A</span>
          <span>
            <strong>AlowAlow</strong>
            <small>Operations</small>
          </span>
        </button>
        <p className="nav-caption">Управление</p>
        <nav className="main-nav" aria-label="Разделы админки">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? "active" : ""}
              aria-label={item.label}
              data-testid={`admin-nav-${item.id}`}
              onClick={() => {
                setView(item.id);
                setIsNavigationOpen(false);
              }}
            >
              <span className="nav-icon"><NavIcon name={item.icon} /></span>
              <span className="nav-label">{item.label}</span>
            </button>
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
          <button aria-label="Выйти" onClick={() => void logout()}>
            ↗
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <button
          className="mobile-nav-toggle"
          aria-label="Открыть меню"
          aria-expanded={isNavigationOpen}
          onClick={() => setIsNavigationOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <Suspense
          fallback={<div className="async-state">Загружаем раздел…</div>}
        >
          {activeView === "orders" && <OrderBoard />}
          {activeView === "kitchen" && (
            <OrderBoard
              title="Кухня"
              description="Повар принимает переданные заказы, начинает готовить и отмечает готовность."
            />
          )}
          {activeView === "map" && <DispatchMap />}
          {activeView === "branches" && <BranchManager />}
          {activeView === "catalog" && <CatalogManager />}
          {activeView === "marketing" && <MarketingManager />}
          {activeView === "notifications" && <NotificationManager />}
          {activeView === "staff" && <StaffManager />}
          {activeView === "cash" && <CashBoard />}
          {activeView === "contacts" && <ContactManager />}
          {activeView === "login-attempts" && <LoginAttemptManager />}
        </Suspense>
      </main>
    </div>
  );
}
