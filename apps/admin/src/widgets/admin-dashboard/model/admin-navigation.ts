import type { Role } from "@/src/entities/order";

export type AdminView =
  | "orders"
  | "map"
  | "branches"
  | "catalog"
  | "marketing"
  | "notifications"
  | "staff"
  | "contacts"
  | "login-attempts";

export type AdminNavIconName = AdminView;

export type AdminNavigationItem = {
  id: AdminView;
  label: string;
  icon: AdminNavIconName;
  path: `/${string}`;
  roles: Role[];
};

export const adminNavigation: AdminNavigationItem[] = [
  {
    id: "login-attempts",
    label: "Попытки входа",
    icon: "login-attempts",
    path: "/login-attempts",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "orders",
    label: "Заказы",
    icon: "orders",
    path: "/orders",
    roles: ["ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "map",
    label: "Карта курьеров",
    icon: "map",
    path: "/couriers/map",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "branches",
    label: "Филиалы",
    icon: "branches",
    path: "/branches",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "catalog",
    label: "Каталог кафе",
    icon: "catalog",
    path: "/catalog",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "marketing",
    label: "Маркетинг",
    icon: "marketing",
    path: "/marketing",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "notifications",
    label: "Уведомления",
    icon: "notifications",
    path: "/notifications",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "staff",
    label: "Команда",
    icon: "staff",
    path: "/staff",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "contacts",
    label: "Контакты",
    icon: "contacts",
    path: "/contacts",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
];

export function navigationForRole(role: Role) {
  return adminNavigation.filter((item) => item.roles.includes(role));
}

export function defaultAdminPathForRole(role: Role) {
  const navigation = navigationForRole(role);
  return (
    navigation.find(({ id }) => id === "orders")?.path ??
    navigation[0]?.path ??
    "/"
  );
}
