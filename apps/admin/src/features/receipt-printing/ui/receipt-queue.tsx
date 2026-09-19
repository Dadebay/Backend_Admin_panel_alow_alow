import type { components } from "@alowalow/api-contract";
import { useReceiptQueue } from "../api/use-receipt-queue";
import { useReceiptPrinting } from "../api/use-receipt-printing";
import "./receipt-queue.css";

const labels: Record<
  components["schemas"]["ReceiptTaskResponseDto"]["status"],
  string
> = {
  PENDING: "Ожидает отправки",
  PROCESSING: "Отправляется",
  DELIVERED: "Передан аппарату",
  FAILED: "Требуется настройка",
  UNCERTAIN: "Проверьте бумажный чек",
};
export function ReceiptQueue() {
  const { queue, agent, worker, retry, directMode } = useReceiptQueue();
  const reprint = useReceiptPrinting();
  const failure = retry.error ?? reprint.error;
  return (
    <details className="receipt-queue" data-testid="receipt-queue">
      <summary data-testid="receipt-queue-toggle">
        Печать:{" "}
        {queue.isError
          ? "нет связи с сервером"
          : queue.isPending
            ? "проверяем очередь…"
            : `${queue.data.pending} в очереди`}
        {Boolean(queue.data?.needsAttention) &&
          ` · проверить: ${queue.data?.needsAttention}`}
      </summary>
      <div className="receipt-queue-content">
        <p role="status" data-testid="receipt-queue-agent-status">
          {directMode
            ? "Программа печати получает чеки напрямую через API. Сайт можно закрыть."
            : agent.isError
              ? "Нет связи с программой печати или требуется её обновление. Очередь сохранена на сервере."
              : worker.isPending
                ? "Передаём чек аппаратам…"
                : worker.isError
                  ? "Связь прервалась. Сохранённое задание будет проверено повторно."
                  : "Оставьте сайт и программу печати открытыми. После восстановления связи очередь продолжится автоматически."}
        </p>
        {queue.isError && (
          <button
            type="button"
            data-testid="receipt-queue-refresh"
            onClick={() => void queue.refetch()}
          >
            Обновить очередь
          </button>
        )}
        {queue.data?.items.length === 0 && <p>Неотправленных чеков нет.</p>}
        {queue.data?.items.map((task) => (
          <div
            className="receipt-queue-item"
            key={task.id}
            data-testid={`receipt-queue-item-${task.id}`}
          >
            <strong>
              #{task.orderNumber} ·{" "}
              {task.documentType === "CANCELLATION" ? "Отмена" : "Заказ"}
            </strong>
            <span>
              {labels[task.status]} · попыток: {task.attempts}
            </span>
            {!directMode &&
              task.stationId &&
              task.stationId !== agent.data?.agentId && (
                <small>
                  Ожидает программу на компьютере, который начал отправку.
                </small>
              )}
            {task.lastError === "NO_PRINTERS" && (
              <small>Укажите аппарат в настройках и создайте новый чек.</small>
            )}
            {task.status === "PENDING" && (
              <button
                type="button"
                disabled={retry.isPending}
                data-testid={`receipt-queue-retry-${task.id}`}
                onClick={() => retry.mutate(task.id)}
              >
                Проверить снова
              </button>
            )}
            {(task.status === "UNCERTAIN" || task.status === "FAILED") && (
              <>
                {task.status === "UNCERTAIN" && (
                  <small>
                    Автоповтор остановлен: чек мог уже выйти. Сначала проверьте
                    аппарат.
                  </small>
                )}
                <button
                  type="button"
                  disabled={reprint.isPending}
                  data-testid={`receipt-queue-reprint-${task.id}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Создать новый чек? Уже вышедшие копии напечатаются повторно. Проверьте бумагу перед продолжением.",
                      )
                    )
                      reprint.mutate(task.orderId);
                  }}
                >
                  Создать новый чек
                </button>
              </>
            )}
          </div>
        ))}
        {(queue.data?.items.length ?? 0) >= 50 && (
          <small>
            Показаны первые 50 заданий. Остальные сохранены в очереди.
          </small>
        )}
        {reprint.isSuccess && (
          <p role="status">Новый чек добавлен в очередь.</p>
        )}
        {failure && <p role="alert">{failure.message}</p>}
      </div>
    </details>
  );
}
