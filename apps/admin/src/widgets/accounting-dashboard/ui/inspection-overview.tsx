import type { InspectionOverview } from "@/src/entities/accounting";
import { inspectionMoney } from "../model/inspection";

function Ranking({
  title,
  rows,
  money = false,
}: {
  title: string;
  rows: { name: string; count: number; foodAmount?: number }[];
  money?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="inspection-chart">
      <h3>{title}</h3>
      {!rows.length && <p>Нет данных за период.</p>}
      <ol>
        {rows.map((row, index) => (
          <li key={`${row.name}-${index}`}>
            <div>
              <span>{row.name}</span>
              <strong>{row.count}</strong>
            </div>
            <meter
              min={0}
              max={max}
              value={row.count}
              aria-label={`${row.name}: ${row.count}`}
            />
            {money && (
              <small>Еда: {inspectionMoney(row.foodAmount ?? 0)}</small>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function InspectionOverviewPanel({
  data,
  onSelectDay,
}: {
  data: InspectionOverview;
  onSelectDay: (date: string) => void;
}) {
  const { summary } = data;
  const max = Math.max(1, ...data.daily.map((day) => day.orders));
  return (
    <div data-testid="inspection-overview">
      <div className="accounting-metrics inspection-metrics">
        <article>
          <small>Создано заказов</small>
          <strong>{summary.createdOrders}</strong>
        </article>
        <article>
          <small>Отменено из этих заказов</small>
          <strong>
            {summary.cancelledOrders} · {summary.cancellationRate}%
          </strong>
        </article>
        <article>
          <small>Еда по неотменённым заказам</small>
          <strong>{inspectionMoney(summary.orderedFoodAmount)}</strong>
        </article>
        <article>
          <small>Доставлено, деньги ещё не вернули</small>
          <strong>{inspectionMoney(summary.deliveredUnreturnedAmount)}</strong>
        </article>
        <article>
          <small>Редактирований в течение периода</small>
          <strong>{summary.editEvents}</strong>
        </article>
        <article>
          <small>Действий отмены в течение периода</small>
          <strong>{summary.cancellationEvents}</strong>
        </article>
      </div>
      <p className="muted-text">
        Заказы и спрос считаются по времени создания. Отмены и редактирования
        как действия — по времени действия, включая заказы прошлых смен. Деньги
        к сдаче считаются по времени возврата денег и показаны в пакетах смен.
      </p>
      <section className="inspection-chart">
        <h3>Заказы и отмены по дням</h3>
        <p className="muted-text">
          Нажмите на дату, чтобы проверить заказы и действия за этот день.
        </p>
        <div className="inspection-days">
          {data.daily.map((day) => (
            <div key={day.date}>
              <button
                type="button"
                className="inspection-day-button"
                data-testid={`inspection-day-${day.date}`}
                onClick={() => onSelectDay(day.date)}
                aria-label={`Проверить день ${day.date}`}
              >
                <time dateTime={day.date}>{day.date}</time>
              </button>
              <meter
                min={0}
                max={max}
                value={day.orders}
                aria-label={`${day.date}: заказов ${day.orders}, отмен ${day.cancelled}`}
              />
              <span>
                {day.orders} заказов · {day.cancelled} отмен
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="inspection-chart-grid">
        <Ranking title="Районы доставки" rows={data.districts} money />
        <Ranking title="Филиалы приготовления" rows={data.branches} money />
        <Ranking
          title="Заказывают чаще"
          rows={data.mostOrderedProducts.map((item) => ({
            name: item.name,
            count: item.quantity,
          }))}
        />
        <Ranking
          title="Заказывают реже"
          rows={data.leastOrderedProducts.map((item) => ({
            name: item.name,
            count: item.quantity,
          }))}
        />
        <Ranking
          title="Причины отмен заказов периода"
          rows={data.cancellationReasons}
          money
        />
      </div>
      <p className="muted-text">
        Популярность — количество порций в неотменённых заказах. В «реже» входят
        блюда, которые хотя бы раз заказали за период. Переименование блюда
        сохраняется отдельной исторической строкой.
      </p>
    </div>
  );
}
