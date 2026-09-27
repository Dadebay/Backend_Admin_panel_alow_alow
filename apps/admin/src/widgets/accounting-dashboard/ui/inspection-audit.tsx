import { useState } from "react";
import type { InspectionAuditPage } from "@/src/entities/accounting";
import { roleLabels, statusLabels } from "@/src/entities/order";
import {
  auditActionLabels,
  auditChanges,
  auditFieldLabels,
  inspectionTime,
} from "../model/inspection";

export function EvidenceValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="muted-text">Не указано</span>;
  if (typeof value === "boolean") return <span>{value ? "Да" : "Нет"}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ol className="inspection-evidence-list">
        {value.map((item, index) => (
          <li key={index}>
            <EvidenceValue value={item} />
          </li>
        ))}
      </ol>
    ) : (
      <span>Пусто</span>
    );
  if (typeof value === "object")
    return (
      <dl className="inspection-evidence">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{auditFieldLabels[key] ?? key}</dt>
            <dd>
              <EvidenceValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <span>
      {typeof value === "string" && value in statusLabels
        ? statusLabels[value as keyof typeof statusLabels]
        : String(value)}
    </span>
  );
}

export function InspectionPagination({
  page,
  total,
  limit,
  onPage,
  prefix,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  prefix: string;
}) {
  return (
    <nav className="inspection-pagination" aria-label="Страницы результатов">
      <span>
        {total
          ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} из ${total}`
          : "Нет записей"}
      </span>
      <div>
        <button
          type="button"
          className="secondary-button"
          data-testid={`${prefix}-previous`}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Назад
        </button>
        <button
          type="button"
          className="secondary-button"
          data-testid={`${prefix}-next`}
          disabled={page * limit >= total}
          onClick={() => onPage(page + 1)}
        >
          Далее
        </button>
      </div>
    </nav>
  );
}

export function InspectionAuditList({
  data,
  onPage,
  onOrder,
  onActor,
}: {
  data: InspectionAuditPage;
  onPage: (page: number) => void;
  onOrder?: (id: string) => void;
  onActor?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div data-testid="inspection-audit-list">
      {!data.items.length && (
        <p className="async-state">За выбранный период действий нет.</p>
      )}
      {data.items.map((event) => {
        const changes =
          expanded === event.id ? auditChanges(event.metadata) : [];
        return (
          <article
            className="inspection-event"
            key={event.id}
            data-testid={`inspection-event-${event.id}`}
          >
            <div className="inspection-event-heading">
              <div>
                <strong>
                  {auditActionLabels[event.action] ?? event.action}
                </strong>
                <small>
                  {inspectionTime(event.createdAt)} ·{" "}
                  {event.actor
                    ? [event.actor.firstName, event.actor.lastName]
                        .filter(Boolean)
                        .join(" ") || event.actor.id
                    : "Системное действие / автор не сохранён"}
                  {event.actor && ` · ${roleLabels[event.actor.role]}`}
                </small>
                <small>
                  {event.entityType} · {event.entityId ?? "—"}
                </small>
              </div>
              <button
                type="button"
                className="secondary-button"
                data-testid={`inspection-event-expand-${event.id}`}
                aria-expanded={expanded === event.id}
                onClick={() =>
                  setExpanded(expanded === event.id ? null : event.id)
                }
              >
                {expanded === event.id ? "Свернуть" : "Что произошло"}
              </button>
            </div>
            {expanded === event.id && (
              <div className="inspection-event-body">
                {changes.length > 0 && (
                  <div className="inspection-change-list">
                    {changes.map((change) => (
                      <section key={change.key}>
                        <h4>{auditFieldLabels[change.key] ?? change.key}</h4>
                        <div className="inspection-before-after">
                          <div>
                            <strong>Было</strong>
                            <EvidenceValue value={change.before} />
                          </div>
                          <div>
                            <strong>Стало</strong>
                            <EvidenceValue value={change.after} />
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                {!changes.length && (
                  <p className="muted-text">
                    Сохранённые сведения о действии. Для старых записей
                    сравнение «было / стало» может отсутствовать.
                  </p>
                )}
                <details>
                  <summary>Все сохранённые сведения</summary>
                  <EvidenceValue value={event.metadata} />
                </details>
                <div className="inspection-event-actions">
                  {event.entityType === "Order" &&
                    event.entityId &&
                    onOrder && (
                      <button
                        type="button"
                        className="secondary-button"
                        data-testid={`inspection-event-order-${event.id}`}
                        onClick={() => onOrder(event.entityId!)}
                      >
                        Открыть заказ
                      </button>
                    )}
                  {event.actor && onActor && (
                    <button
                      type="button"
                      className="secondary-button"
                      data-testid={`inspection-event-actor-${event.id}`}
                      onClick={() => onActor(event.actor!.id)}
                    >
                      Все действия этого сотрудника
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>
        );
      })}
      <InspectionPagination
        {...data}
        onPage={onPage}
        prefix="inspection-audit"
      />
    </div>
  );
}
