import { CourierMapPanel } from "@/src/widgets/courier-map";

export function DispatchMap() {
  return (
    <section className="admin-section">
      <header className="section-head">
        <div>
          <span className="eyebrow">REDIS GPS · LIVE PUSH</span>
          <h1>Карта доставки</h1>
          <p>
            Все активные филиалы, реальные курьеры, их последняя точка,
            несколько активных заказов, клиенты и адреса доставки.
          </p>
        </div>
      </header>
      <CourierMapPanel />
    </section>
  );
}
