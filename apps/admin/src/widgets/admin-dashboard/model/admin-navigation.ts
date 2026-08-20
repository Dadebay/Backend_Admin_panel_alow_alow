import type { Role } from "@/src/entities/order";

export type AdminView =
  | "orders"
  | "map"
  | "branches"
  | "catalog"
  | "marketing"
  | "notifications"
  | "staff"
  | "cash"
  | "contacts"
  | "login-attempts";

export type AdminNavIconName = AdminView;

export type AdminNavigationItem = {
  id: AdminView;
  label: string;
  icon: AdminNavIconName;
  roles: Role[];
};

export const adminNavigation: AdminNavigationItem[] = [
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
    roles: ["ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "map",
    label: "Карта курьеров",
    icon: "map",
    roles: ["ADMIN", "SUPER_ADMIN"],
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
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "marketing",
    label: "Маркетинг",
    icon: "marketing",
    roles: ["ADMIN", "SUPER_ADMIN"],
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
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "cash",
    label: "Наличные",
    icon: "cash",
    roles: ["ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "contacts",
    label: "Контакты",
    icon: "contacts",
    roles: ["ADMIN", "SUPER_ADMIN"],
  },
];

export function navigationForRole(role: Role) {
  return adminNavigation.filter((item) => item.roles.includes(role));
}
