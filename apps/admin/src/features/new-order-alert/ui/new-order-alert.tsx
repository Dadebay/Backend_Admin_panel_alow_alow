import { useEffect, useRef, useState } from "react";
import { useOrders, type Order } from "@/src/entities/order";
import { collectNewItems } from "../model/new-order-alert";

type AlertBatch = {
  orders: Order[];
  announcedAt: number;
};

type BrowserPermission = NotificationPermission | "unsupported";

function readBrowserPermission(): BrowserPermission {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}

function notificationBody(orders: Order[]) {
  if (orders.length > 1) return `Поступило новых заказов: ${orders.length}`;
  const order = orders[0];
  if (!order) return "Поступил новый заказ";
  return `Заказ #${order.number} · ${Number(order.total).toFixed(2)} TMT`;
}

export function NewOrderAlert({ onOpenOrders }: { onOpenOrders: () => void }) {
  const orders = useOrders({
    statuses: ["COOKING", "READY"],
    page: 1,
    limit: 100,
  });
  const seenOrderIds = useRef<Set<string> | null>(null);
  const [alert, setAlert] = useState<AlertBatch | null>(null);
  const [permission, setPermission] = useState<BrowserPermission>(
    readBrowserPermission,
  );

  useEffect(() => {
    const currentOrders = orders.data?.items;
    if (!currentOrders) return;

    const previousIds = seenOrderIds.current;
    const currentIds = new Set(currentOrders.map((order) => order.id));
    const newOrders = collectNewItems(previousIds, currentOrders);
    seenOrderIds.current = currentIds;

    if (!newOrders.length) return;
    const alertTimeout = window.setTimeout(() => {
      setAlert({ orders: newOrders, announcedAt: Date.now() });
    }, 0);

    if (permission !== "granted" || typeof Notification === "undefined") {
      return () => window.clearTimeout(alertTimeout);
    }

    try {
      const notification = new Notification("Новый заказ A7-tagam", {
        body: notificationBody(newOrders),
        icon: "/a7-tagam-logo.png",
        tag: `a7-new-orders-${newOrders.map((order) => order.id).join("-")}`,
      });
      notification.onclick = () => {
        window.focus();
        onOpenOrders();
        notification.close();
      };
    } catch {
      // The in-app alert remains authoritative when the browser blocks a
      // system notification despite a previously granted permission.
    }
    return () => window.clearTimeout(alertTimeout);
  }, [onOpenOrders, orders.data?.items, permission]);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission("denied");
    }
  }

  return (
    <>
      <div
        className={`new-order-alert-control ${orders.isError ? "error" : ""}`}
        data-testid="new-order-alert-control"
      >
        {permission === "default" ? (
          <button
            type="button"
            data-testid="new-order-alert-enable"
            onClick={() => void requestPermission()}
          >
            <span aria-hidden="true">●</span>
            Включить уведомления
          </button>
        ) : (
          <span>
            <i aria-hidden="true" />
            {orders.isError
              ? "Проверка заказов недоступна"
              : permission === "granted"
                ? "Уведомления включены"
                : "Уведомления внутри админки"}
          </span>
        )}
      </div>

      {alert && (
        <aside
          className="new-order-alert-toast"
          data-testid="new-order-alert-toast"
          role="status"
          aria-live="assertive"
        >
          <div>
            <span className="eyebrow">НОВЫЙ ЗАКАЗ</span>
            <strong>{notificationBody(alert.orders)}</strong>
            <small>
              Проверено в{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(alert.announcedAt)}
            </small>
          </div>
          <div className="new-order-alert-actions">
            <button
              type="button"
              className="primary-button compact"
              data-testid="new-order-alert-open"
              onClick={() => {
                onOpenOrders();
                setAlert(null);
              }}
            >
              Открыть заказы
            </button>
            <button
              type="button"
              className="new-order-alert-close"
              data-testid="new-order-alert-close"
              aria-label="Закрыть уведомление"
              onClick={() => setAlert(null)}
            >
              ×
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
