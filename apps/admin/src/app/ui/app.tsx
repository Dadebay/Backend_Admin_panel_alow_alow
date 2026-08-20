import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
} from "react-router";
import {
  AdminDashboard,
  adminNavigation,
  defaultAdminPathForRole,
  type AdminNavigationItem,
  type AdminView,
} from "@/src/widgets/admin-dashboard";
import { useSession } from "@/src/shared/auth";
import { AppProviders } from "../providers";

const adminRouteComponents = {
  orders: lazy(() =>
    import("@/src/widgets/order-board").then((module) => ({
      default: module.OrderBoard,
    })),
  ),
  map: lazy(() =>
    import("@/src/widgets/dispatch-map").then((module) => ({
      default: module.DispatchMap,
    })),
  ),
  branches: lazy(() =>
    import("@/src/widgets/branch-manager").then((module) => ({
      default: module.BranchManager,
    })),
  ),
  catalog: lazy(() =>
    import("@/src/widgets/catalog-manager").then((module) => ({
      default: module.CatalogManager,
    })),
  ),
  marketing: lazy(() =>
    import("@/src/widgets/marketing-manager").then((module) => ({
      default: module.MarketingManager,
    })),
  ),
  notifications: lazy(() =>
    import("@/src/widgets/notification-manager").then((module) => ({
      default: module.NotificationManager,
    })),
  ),
  staff: lazy(() =>
    import("@/src/widgets/staff-manager").then((module) => ({
      default: module.StaffManager,
    })),
  ),
  cash: lazy(() =>
    import("@/src/widgets/cash-board").then((module) => ({
      default: module.CashBoard,
    })),
  ),
  contacts: lazy(() =>
    import("@/src/widgets/contact-manager").then((module) => ({
      default: module.ContactManager,
    })),
  ),
  "login-attempts": lazy(() =>
    import("@/src/widgets/login-attempt-manager").then((module) => ({
      default: module.LoginAttemptManager,
    })),
  ),
} satisfies Record<AdminView, LazyExoticComponent<ComponentType>>;

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
        <Link
          className="primary-button link-button"
          data-testid="app-not-found-home"
          to="/orders"
        >
          Открыть заказы
        </Link>
      </section>
    </main>
  );
}

function RoleProtectedView({
  navigationItem,
  children,
}: {
  navigationItem: AdminNavigationItem;
  children: ReactNode;
}) {
  const { session } = useSession();

  if (!session) return null;
  if (!navigationItem.roles.includes(session.user.role)) {
    return (
      <Navigate
        replace
        to={defaultAdminPathForRole(session.user.role)}
      />
    );
  }

  return children;
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/orders" />} />
      <Route element={<AdminDashboard />}>
        {adminNavigation.map((navigationItem) => {
          const Component = adminRouteComponents[navigationItem.id];
          return (
            <Route
              key={navigationItem.id}
              path={navigationItem.path}
              element={
                <RoleProtectedView navigationItem={navigationItem}>
                  <Component />
                </RoleProtectedView>
              }
            />
          );
        })}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <AdminRoutes />
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  );
}
