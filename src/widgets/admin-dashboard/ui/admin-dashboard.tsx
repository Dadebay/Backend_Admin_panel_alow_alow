"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { roleLabels, type Role } from "@/src/entities/order";
import { OtpLoginCard } from "@/src/features/otp-login";
import { useSession } from "@/src/shared/auth";

const OrderBoard = dynamic(
  () => import("@/src/widgets/order-board").then((module) => module.OrderBoard),
  { loading: () => <div className="async-state">Загружаем заказы…</div> },
);
const DispatchMap = dynamic(
  () => import("@/src/widgets/dispatch-map").then((module) => module.DispatchMap),
  { loading: () => <div className="async-state">Загружаем карту…</div> },
);
const CatalogManager = dynamic(
  () =>
    import("@/src/widgets/catalog-manager").then(
      (module) => module.CatalogManager,
    ),
  { loading: () => <div className="async-state">Загружаем каталог…</div> },
);
const MarketingManager = dynamic(
  () =>
    import("@/src/widgets/marketing-manager").then(
      (module) => module.MarketingManager,
    ),
  { loading: () => <div className="async-state">Загружаем маркетинг…</div> },
);
const StaffManager = dynamic(
  () =>
    import("@/src/widgets/staff-manager").then(
      (module) => module.StaffManager,
    ),
  { loading: () => <div className="async-state">Загружаем команду…</div> },
);
const CashBoard = dynamic(
  () => import("@/src/widgets/cash-board").then((module) => module.CashBoard),
  { loading: () => <div className="async-state">Загружаем кассу…</div> },
);

type View =
  | "orders"
  | "kitchen"
  | "map"
  | "catalog"
  | "marketing"
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
    roles: ["OPERATOR", "COOK", "COURIER", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
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
    return <main className="login-page">Проверяем защищённую сессию…</main>;
  }

  if (!session) {
    return (
      <main className="login-page">
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
      <main className="login-page">
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
      <main className="login-page">
        <div className="access-card">
          <h1>Экран курьера</h1>
          <p>
            Включите передачу GPS и работайте со всеми назначенными заказами.
          </p>
          <Link className="primary-button link-button" href="/courier">
            Открыть приложение курьера
          </Link>
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
    : visibleNav[0]?.id ?? "orders";
  const userName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") ||
    session.user.phone;

  return (
    <div className="app-shell integrated-shell">
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
        {activeView === "orders" && <OrderBoard />}
        {activeView === "kitchen" && (
          <OrderBoard
            title="Кухня"
            description="Повар принимает переданные заказы, начинает готовить и отмечает готовность."
          />
        )}
        {activeView === "map" && <DispatchMap />}
        {activeView === "catalog" && <CatalogManager />}
        {activeView === "marketing" && <MarketingManager />}
        {activeView === "staff" && <StaffManager />}
        {activeView === "cash" && <CashBoard />}
      </main>
    </div>
  );
}
