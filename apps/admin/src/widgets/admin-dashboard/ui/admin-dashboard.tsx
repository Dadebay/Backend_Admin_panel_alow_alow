import { lazy, Suspense, useState } from "react";
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

type View =
  | "orders"
  | "kitchen"
  | "map"
  | "branches"
  | "catalog"
  | "marketing"
  | "notifications"
  | "staff"
  | "cash";

const nav: Array<{
  id: View;
  label: string;
  icon: string;
  roles: Role[];
}> = [
  {
    id: "orders",
    label: "Заказы",
    icon: "▤",
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
    icon: "◴",
    roles: ["COOK", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "map",
    label: "Карта курьеров",
    icon: "⌖",
    roles: ["OPERATOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "branches",
    label: "Филиалы",
    icon: "⌂",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "catalog",
    label: "Каталог кафе",
    icon: "◫",
    roles: ["OPERATOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "marketing",
    label: "Маркетинг",
    icon: "◇",
    roles: ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "notifications",
    label: "Уведомления",
    icon: "◉",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "staff",
    label: "Команда",
    icon: "◎",
    roles: ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "cash",
    label: "Наличные",
    icon: "₼",
    roles: ["OPERATOR", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
];

function initials(firstName: string | null, lastName: string | null) {
  const value = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`;
  return value || "AA";
}

export function AdminDashboard() {
  const { session, ready, logout } = useSession();
  const [view, setView] = useState<View>("orders");

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
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("orders")}>
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
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
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
        </Suspense>
      </main>
    </div>
  );
}
