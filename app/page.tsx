"use client";

import { useMemo, useState } from "react";

type Role =
  | "OPERATOR"
  | "COOK"
  | "COURIER"
  | "ACCOUNTANT"
  | "ADMIN";
type Status =
  | "NEW"
  | "CONFIRMED"
  | "SENT_TO_KITCHEN"
  | "COOKING"
  | "READY"
  | "ASSIGNED_TO_COURIER"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CASH_RETURNED"
  | "COMPLETED"
  | "RECONCILED"
  | "CANCELLED";
type NavKey = "orders" | "catalog" | "marketing" | "team" | "cash";

type DemoOrder = {
  id: number;
  customer: string;
  phone: string;
  items: string;
  total: number;
  status: Status;
  time: string;
  address: string;
  courier?: string;
  eta?: string;
};

const initialOrders: DemoOrder[] = [
  {
    id: 1048,
    customer: "Aýlar B.",
    phone: "+993 65 42 18 90",
    items: "ALO Burger ×2, фри, Cola",
    total: 126,
    status: "NEW",
    time: "2 мин",
    address: "ул. 1945, дом 16",
  },
  {
    id: 1047,
    customer: "Myrat O.",
    phone: "+993 61 77 32 09",
    items: "Маргарита, Цезарь",
    total: 112,
    status: "COOKING",
    time: "11 мин",
    address: "пр. Magtymguly, 72",
  },
  {
    id: 1046,
    customer: "Leýli A.",
    phone: "+993 63 08 44 19",
    items: "Chicken Box ×2",
    total: 148,
    status: "READY",
    time: "18 мин",
    address: "ул. Andalyp, 48",
  },
  {
    id: 1045,
    customer: "Serdar H.",
    phone: "+993 62 51 10 77",
    items: "Family Pizza, морс ×3",
    total: 214,
    status: "OUT_FOR_DELIVERY",
    time: "27 мин",
    address: "ул. Görogly, 21",
    courier: "Maksat",
    eta: "9 мин",
  },
  {
    id: 1044,
    customer: "Ogulşat K.",
    phone: "+993 65 90 11 02",
    items: "Double Burger, кофе",
    total: 83,
    status: "CASH_RETURNED",
    time: "43 мин",
    address: "пр. Bitarap, 101",
    courier: "Maksat",
  },
  {
    id: 1043,
    customer: "Döwlet M.",
    phone: "+993 64 11 68 30",
    items: "Пепперони, Cola ×2",
    total: 103,
    status: "ASSIGNED_TO_COURIER",
    time: "31 мин",
    address: "ул. Azady, 63",
    courier: "Maksat",
    eta: "18 мин",
  },
];

const statusMeta: Record<Status, { label: string; tone: string }> = {
  NEW: { label: "Новый", tone: "blue" },
  CONFIRMED: { label: "Подтверждён", tone: "violet" },
  SENT_TO_KITCHEN: { label: "Передан повару", tone: "violet" },
  COOKING: { label: "Готовится", tone: "orange" },
  READY: { label: "Готов", tone: "green" },
  ASSIGNED_TO_COURIER: { label: "Назначен курьер", tone: "teal" },
  OUT_FOR_DELIVERY: { label: "В пути", tone: "teal" },
  DELIVERED: { label: "Доставлен", tone: "green" },
  CASH_RETURNED: { label: "Наличные сданы", tone: "amber" },
  COMPLETED: { label: "Завершён", tone: "slate" },
  RECONCILED: { label: "Сверен", tone: "slate" },
  CANCELLED: { label: "Отменён", tone: "red" },
};

const roleLabels: Record<Role, string> = {
  OPERATOR: "Оператор",
  COOK: "Повар",
  COURIER: "Курьер",
  ACCOUNTANT: "Бухгалтер",
  ADMIN: "Администратор",
};

const nextByRole: Record<Role, Partial<Record<Status, Status>>> = {
  OPERATOR: {
    NEW: "CONFIRMED",
    CONFIRMED: "SENT_TO_KITCHEN",
    READY: "ASSIGNED_TO_COURIER",
    CASH_RETURNED: "COMPLETED",
  },
  COOK: {
    SENT_TO_KITCHEN: "COOKING",
    COOKING: "READY",
  },
  COURIER: {
    ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
    DELIVERED: "CASH_RETURNED",
  },
  ACCOUNTANT: { COMPLETED: "RECONCILED" },
  ADMIN: {
    NEW: "CONFIRMED",
    CONFIRMED: "SENT_TO_KITCHEN",
    SENT_TO_KITCHEN: "COOKING",
    COOKING: "READY",
    READY: "ASSIGNED_TO_COURIER",
    ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
    DELIVERED: "CASH_RETURNED",
    CASH_RETURNED: "COMPLETED",
    COMPLETED: "RECONCILED",
  },
};

const actionLabels: Partial<Record<Status, string>> = {
  CONFIRMED: "Подтвердить",
  SENT_TO_KITCHEN: "Передать повару",
  COOKING: "Начать готовить",
  READY: "Заказ готов",
  ASSIGNED_TO_COURIER: "Назначить курьера",
  OUT_FOR_DELIVERY: "Забрал заказ",
  DELIVERED: "Доставлено",
  CASH_RETURNED: "Сдать наличные",
  COMPLETED: "Подтвердить деньги",
  RECONCILED: "Провести сверку",
};

const money = new Intl.NumberFormat("ru-RU");

export default function AdminDashboard() {
  const [nav, setNav] = useState<NavKey>("orders");
  const [role, setRole] = useState<Role>("OPERATOR");
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(1045);
  const [toast, setToast] = useState("Система работает штатно");
  const [modal, setModal] = useState<"product" | "promo" | null>(null);
  const [products, setProducts] = useState([
    { name: "ALO Burger", category: "Бургеры", price: 48, active: true, color: "coral" },
    { name: "Маргарита", category: "Пицца", price: 65, active: true, color: "yellow" },
    { name: "Chicken Box", category: "Комбо", price: 74, active: true, color: "green" },
    { name: "Цезарь", category: "Салаты", price: 47, active: false, color: "purple" },
  ]);

  const visibleOrders = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return orders.filter(
      (order) =>
        (filter === "ALL" || order.status === filter) &&
        (!needle ||
          String(order.id).includes(needle) ||
          order.customer.toLowerCase().includes(needle) ||
          order.phone.includes(needle)),
    );
  }, [filter, orders, query]);

  const selectedOrder =
    orders.find((order) => order.id === selected) ?? orders[0];

  function advance(order: DemoOrder) {
    const target = nextByRole[role][order.status];
    if (!target) return;
    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? {
              ...item,
              status: target,
              courier:
                target === "ASSIGNED_TO_COURIER"
                  ? "Maksat"
                  : item.courier,
            }
          : item,
      ),
    );
    setToast(
      `Заказ #${order.id}: ${statusMeta[target].label.toLowerCase()}`,
    );
  }

  function cancelOrder(id: number) {
    setOrders((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "CANCELLED" } : item,
      ),
    );
    setToast(`Заказ #${id} отменён до передачи повару`);
  }

  const navItems: Array<{ key: NavKey; icon: string; label: string; count?: number }> = [
    { key: "orders", icon: "▦", label: "Заказы", count: orders.filter((o) => !["RECONCILED", "CANCELLED"].includes(o.status)).length },
    { key: "catalog", icon: "◫", label: "Каталог" },
    { key: "marketing", icon: "◇", label: "Баннеры и промо" },
    { key: "team", icon: "◎", label: "Команда" },
    { key: "cash", icon: "₼", label: "Наличные", count: 1 },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setNav("orders")} aria-label="ALO Food">
          <span className="brand-mark">A</span>
          <span>
            <strong>ALO</strong>
            <small>food operations</small>
          </span>
        </button>

        <p className="nav-caption">Управление</p>
        <nav className="main-nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={nav === item.key ? "active" : ""}
              onClick={() => setNav(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.count ? <em>{item.count}</em> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="live-dot" />
          <div>
            <strong>Смена открыта</strong>
            <small>с 09:00 · Ашхабад</small>
          </div>
        </div>

        <div className="sidebar-user">
          <span className="avatar">AG</span>
          <div>
            <strong>Arslan G.</strong>
            <small>{roleLabels[role]}</small>
          </div>
          <button aria-label="Настройки профиля">•••</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Понедельник, 27 июля</p>
            <h1>{nav === "orders" ? "Центр заказов" : navItems.find((item) => item.key === nav)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <label className="role-switch">
              <span>Режим доступа</span>
              <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <button className="icon-button" aria-label="Уведомления">
              <span>3</span>◌
            </button>
            <button
              className="primary-button"
              onClick={() => setModal(nav === "marketing" ? "promo" : "product")}
            >
              <span>＋</span>{nav === "marketing" ? "Новый промокод" : "Добавить"}
            </button>
          </div>
        </header>

        <div className="toast-line">
          <span className="check">✓</span>
          <span>{toast}</span>
          <time>сейчас</time>
        </div>

        {nav === "orders" && (
          <OrdersView
            orders={orders}
            visibleOrders={visibleOrders}
            selectedOrder={selectedOrder}
            selected={selected}
            setSelected={setSelected}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            role={role}
            advance={advance}
            cancelOrder={cancelOrder}
          />
        )}
        {nav === "catalog" && (
          <CatalogView products={products} setProducts={setProducts} openModal={() => setModal("product")} />
        )}
        {nav === "marketing" && <MarketingView openModal={() => setModal("promo")} />}
        {nav === "team" && <TeamView />}
        {nav === "cash" && <CashView />}
      </main>

      {modal && (
        <CreateModal
          type={modal}
          onClose={() => setModal(null)}
          onSave={(name) => {
            if (modal === "product") {
              setProducts((current) => [
                ...current,
                { name: name || "Новая позиция", category: "Бургеры", price: 55, active: true, color: "coral" },
              ]);
            }
            setToast(modal === "product" ? "Позиция добавлена в каталог" : "Промокод создан");
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function OrdersView({
  orders,
  visibleOrders,
  selectedOrder,
  selected,
  setSelected,
  filter,
  setFilter,
  query,
  setQuery,
  role,
  advance,
  cancelOrder,
}: {
  orders: DemoOrder[];
  visibleOrders: DemoOrder[];
  selectedOrder: DemoOrder;
  selected: number;
  setSelected: (id: number) => void;
  filter: "ALL" | Status;
  setFilter: (filter: "ALL" | Status) => void;
  query: string;
  setQuery: (query: string) => void;
  role: Role;
  advance: (order: DemoOrder) => void;
  cancelOrder: (id: number) => void;
}) {
  const activeCount = orders.filter((o) => !["CANCELLED", "RECONCILED"].includes(o.status)).length;
  const revenue = orders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + o.total, 0);
  return (
    <>
      <section className="metrics-grid">
        <article className="metric-card featured">
          <div className="metric-icon">↗</div>
          <div>
            <p>Активные заказы</p>
            <strong>{activeCount}</strong>
            <small><b>+12%</b> к вчерашнему дню</small>
          </div>
          <div className="mini-bars"><i /><i /><i /><i /><i /><i /></div>
        </article>
        <article className="metric-card">
          <span className="metric-symbol orange">◷</span>
          <div><p>Среднее время</p><strong>28 <small>мин</small></strong><small>цель: до 35 минут</small></div>
        </article>
        <article className="metric-card">
          <span className="metric-symbol green">₼</span>
          <div><p>Выручка за смену</p><strong>{money.format(revenue)} <small>TMT</small></strong><small><b>+8.4%</b> с утра</small></div>
        </article>
        <article className="metric-card">
          <span className="metric-symbol violet">◎</span>
          <div><p>Курьеры на линии</p><strong>4 <small>/ 5</small></strong><small>несут 7 заказов</small></div>
        </article>
      </section>

      <section className="workspace-grid">
        <div className="orders-card">
          <div className="section-head">
            <div>
              <h2>Живая очередь</h2>
              <p>Данные обновляются автоматически</p>
            </div>
            <label className="search-box">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Номер, клиент, телефон"
              />
              <kbd>⌘ K</kbd>
            </label>
          </div>

          <div className="filter-row">
            {([
              ["ALL", "Все"],
              ["NEW", "Новые"],
              ["COOKING", "На кухне"],
              ["READY", "Готовы"],
              ["OUT_FOR_DELIVERY", "В доставке"],
            ] as Array<["ALL" | Status, string]>).map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
                {key !== "ALL" && <span>{orders.filter((o) => o.status === key).length}</span>}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Заказ</th>
                  <th>Клиент</th>
                  <th>Состав</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Время</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const next = nextByRole[role][order.status];
                  const cancellable =
                    ["OPERATOR", "ADMIN"].includes(role) &&
                    ["NEW", "CONFIRMED"].includes(order.status);
                  return (
                    <tr
                      key={order.id}
                      className={selected === order.id ? "selected" : ""}
                      onClick={() => setSelected(order.id)}
                    >
                      <td><strong>#{order.id}</strong><small>наличные</small></td>
                      <td><strong>{order.customer}</strong><small>{order.phone}</small></td>
                      <td><span className="item-copy">{order.items}</span></td>
                      <td><strong>{money.format(order.total)} TMT</strong></td>
                      <td><StatusPill status={order.status} /></td>
                      <td><strong>{order.time}</strong>{order.eta && <small>ETA {order.eta}</small>}</td>
                      <td>
                        <div className="row-actions">
                          {next && (
                            <button
                              className="row-primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                advance(order);
                              }}
                            >
                              {actionLabels[next]} →
                            </button>
                          )}
                          {cancellable && (
                            <button
                              className="row-more"
                              title="Отменить до кухни"
                              onClick={(event) => {
                                event.stopPropagation();
                                cancelOrder(order.id);
                              }}
                            >×</button>
                          )}
                          {!next && !cancellable && <button className="row-more">•••</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visibleOrders.length && <div className="empty-state">Заказов по этому фильтру нет</div>}
          </div>
        </div>

        <aside className="dispatch-card">
          <div className="section-head compact">
            <div><h2>Курьеры на карте</h2><p>Ашхабад · сейчас</p></div>
            <button className="square-button">↗</button>
          </div>
          <div className="map">
            <div className="road road-one" />
            <div className="road road-two" />
            <div className="road road-three" />
            <div className="block b1" /><div className="block b2" /><div className="block b3" />
            <span className="map-label l1">Magtymguly</span>
            <span className="map-label l2">Bitarap</span>
            <span className="map-pin restaurant">A</span>
            <span className="map-pin courier c1">M</span>
            <span className="map-pin courier c2">B</span>
            <span className="map-pin order-pin">#{selectedOrder.id}</span>
          </div>

          <div className="selected-stop">
            <div className="stop-top">
              <span className="route-index">1</span>
              <div><strong>Заказ #{selectedOrder.id}</strong><small>{selectedOrder.address}</small></div>
              {selectedOrder.eta && <em>{selectedOrder.eta}</em>}
            </div>
            <div className="route-line">
              <span />
              <p>{selectedOrder.courier ? `Курьер ${selectedOrder.courier}` : "Курьер ещё не назначен"}</p>
            </div>
          </div>

          <div className="courier-list">
            <div><span className="avatar peach">MK</span><p><strong>Maksat K.</strong><small>2 заказа · 4.9 ★</small></p><b className="online">На линии</b></div>
            <div><span className="avatar mint">BR</span><p><strong>Batyr R.</strong><small>1 заказ · 4.8 ★</small></p><b className="online">На линии</b></div>
          </div>
        </aside>
      </section>

      <section className="cash-strip">
        <div className="cash-icon">₼</div>
        <div><p>Ожидает подтверждения оператора</p><strong>Заказ #1044 · курьер Maksat передал 83 TMT</strong></div>
        <span>43 мин назад</span>
        <button>Открыть расчёты →</button>
      </section>
    </>
  );
}

function StatusPill({ status }: { status: Status }) {
  const meta = statusMeta[status];
  return <span className={`status-pill ${meta.tone}`}><i />{meta.label}</span>;
}

function CatalogView({
  products,
  setProducts,
  openModal,
}: {
  products: Array<{ name: string; category: string; price: number; active: boolean; color: string }>;
  setProducts: React.Dispatch<React.SetStateAction<Array<{ name: string; category: string; price: number; active: boolean; color: string }>>>;
  openModal: () => void;
}) {
  return (
    <section className="content-card">
      <div className="page-intro">
        <div><span className="section-kicker">Меню приложения</span><h2>Каталог блюд</h2><p>Категории, описания, цены и изображения, доступные клиентам.</p></div>
        <button className="primary-button" onClick={openModal}>＋ Новая позиция</button>
      </div>
      <div className="category-chips">
        {["Все позиции 24", "Бургеры 6", "Пицца 5", "Комбо 4", "Салаты 3", "Напитки 6"].map((item, index) => (
          <button key={item} className={index === 0 ? "active" : ""}>{item}</button>
        ))}
      </div>
      <div className="product-grid">
        {products.map((product, index) => (
          <article className="product-card" key={`${product.name}-${index}`}>
            <div className={`product-art ${product.color}`}>
              <span>{product.category === "Пицца" ? "◉" : product.category === "Салаты" ? "✳" : "≋"}</span>
              {!product.active && <em>Скрыто</em>}
            </div>
            <div className="product-copy">
              <small>{product.category}</small>
              <h3>{product.name}</h3>
              <p>{product.category === "Пицца" ? "Томаты, моцарелла и базилик на тонком тесте." : "Свежие ингредиенты и фирменный соус ALO."}</p>
              <div><strong>{product.price} TMT</strong><button>Редактировать</button></div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={product.active}
                onChange={() => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, active: !item.active } : item))}
              />
              <span />
            </label>
          </article>
        ))}
        <button className="add-card" onClick={openModal}><span>＋</span><strong>Добавить блюдо</strong><small>Название, цена, фото и описание</small></button>
      </div>
    </section>
  );
}

function MarketingView({ openModal }: { openModal: () => void }) {
  return (
    <div className="two-column-content">
      <section className="content-card">
        <div className="page-intro"><div><span className="section-kicker">Главная клиента</span><h2>Активные баннеры</h2></div><button className="secondary-button">＋ Баннер</button></div>
        <div className="banner-preview">
          <div><span>ТОЛЬКО СЕГОДНЯ</span><h3>Вечер вкуснее<br />с ALO</h3><p>−20% на семейные комбо</p></div>
          <strong>20<small>%</small></strong>
        </div>
        <div className="list-row"><span className="drag">⁝⁝</span><span className="thumb coral" /><div><strong>Семейный вечер</strong><small>До 27 июля, 23:59</small></div><StatusPill status="READY" /><button>•••</button></div>
      </section>
      <section className="content-card">
        <div className="page-intro"><div><span className="section-kicker">Скидки</span><h2>Промокоды</h2></div><button className="primary-button" onClick={openModal}>＋ Создать</button></div>
        {[
          ["WELCOME15", "15%", "Первый заказ", "128 / 500"],
          ["FAMILY20", "20 TMT", "От 150 TMT", "48 / 100"],
          ["JULY10", "10%", "До конца июля", "82 / ∞"],
        ].map(([code, value, rule, usage]) => (
          <div className="promo-row" key={code}><span className="coupon">%</span><div><strong>{code}</strong><small>{rule}</small></div><b>{value}</b><div className="usage"><span><i style={{ width: `${Math.min(90, Number(usage.split(" ")[0]) / 2)}%` }} /></span><small>{usage}</small></div><button>•••</button></div>
        ))}
      </section>
    </div>
  );
}

function TeamView() {
  const staff = [
    ["MK", "Maksat Kerimow", "Курьер", "2 активных заказа", "peach"],
    ["BR", "Batyr Rejepow", "Курьер", "1 активный заказ", "mint"],
    ["AA", "Aýna Ataýewa", "Оператор", "Смена с 09:00", "lavender"],
    ["BG", "Begenç G.", "Повар", "3 заказа на кухне", "blue-avatar"],
    ["OJ", "Oguljan J.", "Бухгалтер", "1 сверка ожидает", "yellow-avatar"],
  ];
  return (
    <section className="content-card">
      <div className="page-intro"><div><span className="section-kicker">Доступы и нагрузка</span><h2>Команда смены</h2><p>Роль определяет доступные действия и этапы заказа.</p></div><button className="primary-button">＋ Сотрудник</button></div>
      <div className="role-summary">
        {["Операторы 2", "Повара 3", "Курьеры 5", "Бухгалтеры 1"].map((item) => <div key={item}><strong>{item.split(" ")[1]}</strong><span>{item.split(" ")[0]}</span></div>)}
      </div>
      <div className="staff-list">
        {staff.map(([initials, name, job, activity, color]) => (
          <div className="staff-row" key={name}><span className={`avatar large ${color}`}>{initials}</span><div><strong>{name}</strong><small>{job}</small></div><span className="activity-dot"><i />{activity}</span><b>4.9 ★</b><button>Управлять</button></div>
        ))}
      </div>
    </section>
  );
}

function CashView() {
  return (
    <section className="content-card">
      <div className="page-intro"><div><span className="section-kicker">Контроль наличных</span><h2>Расчёты с курьерами</h2><p>Курьер фиксирует передачу, оператор подтверждает, бухгалтер проводит сверку.</p></div><button className="secondary-button">Экспорт смены</button></div>
      <div className="cash-overview">
        <article><span>К получению</span><strong>83 TMT</strong><small>1 передача ожидает</small></article>
        <article><span>У оператора</span><strong>644 TMT</strong><small>8 заказов</small></article>
        <article><span>Сверено</span><strong>1 284 TMT</strong><small>с 09:00 сегодня</small></article>
      </div>
      <div className="settlement-table">
        <div className="settlement-head"><span>Заказ</span><span>Курьер</span><span>Сумма</span><span>Передано</span><span>Статус</span><span /></div>
        <div><strong>#1044</strong><span>Maksat K.</span><b>83 TMT</b><span>10:47</span><span className="status-pill amber"><i />Ждёт оператора</span><button>Подтвердить</button></div>
        <div><strong>#1039</strong><span>Batyr R.</span><b>156 TMT</b><span>10:31</span><span className="status-pill green"><i />Подтверждено</span><button className="ghost">Подробнее</button></div>
        <div><strong>#1034</strong><span>Maksat K.</span><b>112 TMT</b><span>09:58</span><span className="status-pill slate"><i />Сверено</span><button className="ghost">Подробнее</button></div>
      </div>
    </section>
  );
}

function CreateModal({
  type,
  onClose,
  onSave,
}: {
  type: "product" | "promo";
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={type === "product" ? "Новое блюдо" : "Новый промокод"}>
        <div className="modal-head"><div><span className="section-kicker">{type === "product" ? "Каталог" : "Маркетинг"}</span><h2>{type === "product" ? "Новое блюдо" : "Создать промокод"}</h2></div><button onClick={onClose}>×</button></div>
        <label><span>{type === "product" ? "Название" : "Код"}</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={type === "product" ? "Например, ALO Cheeseburger" : "Например, SUMMER20"} /></label>
        <div className="modal-grid">
          <label><span>{type === "product" ? "Категория" : "Тип скидки"}</span><select><option>{type === "product" ? "Бургеры" : "Процент"}</option><option>{type === "product" ? "Пицца" : "Фиксированная сумма"}</option></select></label>
          <label><span>{type === "product" ? "Цена, TMT" : "Значение"}</span><input type="number" defaultValue={type === "product" ? 55 : 15} /></label>
        </div>
        {type === "product" && <><label><span>Описание</span><textarea placeholder="Состав и особенности блюда" /></label><button className="upload-drop"><span>↥</span><strong>Загрузить изображения</strong><small>JPG, PNG или WebP до 5 МБ</small></button></>}
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" onClick={() => onSave(name)}>{type === "product" ? "Добавить блюдо" : "Создать промокод"}</button></div>
      </div>
    </div>
  );
}
