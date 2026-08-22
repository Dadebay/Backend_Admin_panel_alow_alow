import { CourierMapPanel } from "@/src/widgets/courier-map";

export function DispatchMap() {
  return (
    <section className="admin-section" data-testid="dispatch-map-page">
      <header className="section-head" data-testid="dispatch-map-header">
        <div>
          <span className="eyebrow">REDIS GPS · LIVE PUSH</span>
          <h1>Карта доставки</h1>
          <p>
            Все курьеры на смене: живая точка, имя, статус «свободен / в
            заказе», маршрут и адреса доставки.
          </p>
        </div>
      </header>
      <CourierMapPanel />
    </section>
  );
}
