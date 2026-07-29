import { CourierMapPanel } from "@/src/widgets/courier-map";

export function DispatchMap() {
  return (
    <section className="admin-section">
      <header className="section-head">
        <div>
          <span className="eyebrow">REDIS GPS · 2 МИНУТЫ</span>
          <h1>Карта доставки</h1>
          <p>
            Реальные курьеры, их последняя точка, несколько активных заказов,
            клиенты и адреса доставки.
          </p>
        </div>
      </header>
      <CourierMapPanel />
    </section>
  );
}
