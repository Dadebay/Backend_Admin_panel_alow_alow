import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import {
  useNotificationCampaigns,
  type NotificationCampaign,
  type NotificationCampaignStatus,
} from "@/src/entities/notification";
import { useNotificationActions } from "@/src/features/notification-management";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  notificationFormSchema,
  type NotificationFormInput,
  type NotificationFormValues,
} from "../model/notification-form";

const statusView: Record<
  NotificationCampaignStatus,
  { label: string; tone: string }
> = {
  PENDING: { label: "В очереди", tone: "amber" },
  SENDING: { label: "Отправляется", tone: "blue" },
  SENT: { label: "Отправлено", tone: "green" },
  PARTIAL: { label: "Частично", tone: "orange" },
  FAILED: { label: "Ошибка", tone: "red" },
};

function creatorName(campaign: NotificationCampaign) {
  return (
    [campaign.createdBy.firstName, campaign.createdBy.lastName]
      .filter(Boolean)
      .join(" ") || campaign.createdBy.phone
  );
}

export function NotificationManager() {
  const [page, setPage] = useState(1);
  const campaigns = useNotificationCampaigns(page);
  const actions = useNotificationActions();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NotificationFormInput, unknown, NotificationFormValues>({
    resolver: zodResolver(notificationFormSchema),
    mode: "onBlur",
    defaultValues: { title: "", body: "", deepLink: "" },
  });

  const columns = useMemo<ColumnDef<NotificationCampaign, unknown>[]>(
    () => [
      {
        header: "Уведомление",
        cell: ({ row }) => (
          <div className="primary-cell notification-copy">
            <strong>{row.original.title}</strong>
            <small>{row.original.body}</small>
            {row.original.deepLink && <code>{row.original.deepLink}</code>}
          </div>
        ),
      },
      {
        header: "Аудитория",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.intendedUserCount} клиентов</strong>
            <small>{row.original.deviceCount} устройств</small>
          </div>
        ),
      },
      {
        header: "Доставка",
        cell: ({ row }) => (
          <div className="notification-delivery-counts">
            <span>{row.original.sentCount} доставлено</span>
            {row.original.failedCount > 0 && (
              <span className="failed">
                {row.original.failedCount} с ошибкой
              </span>
            )}
          </div>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => {
          const view = statusView[row.original.status];
          return (
            <span className={`status-pill ${view.tone}`}>
              <i />
              {view.label}
            </span>
          );
        },
      },
      {
        header: "Создано",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>
              {new Date(row.original.createdAt).toLocaleString("ru-RU", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </strong>
            <small>{creatorName(row.original)}</small>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          ["FAILED", "PARTIAL"].includes(row.original.status) ? (
            <button
              className="secondary-button compact"
              data-testid={`notification-retry-${row.original.id}`}
              disabled={actions.retry.isPending}
              onClick={() => actions.retry.mutate(row.original.id)}
              type="button"
            >
              Повторить
            </button>
          ) : null,
      },
    ],
    [actions.retry],
  );

  async function submit(values: NotificationFormValues) {
    await actions.create.mutateAsync({
      title: values.title,
      body: values.body,
      deepLink: values.deepLink,
      audience: "ALL_CUSTOMERS",
    });
    reset();
    setPage(1);
  }

  const mutationError = actions.create.error || actions.retry.error;

  return (
    <section className="admin-section" data-testid="notification-manager">
      <header className="section-head">
        <div>
          <span className="eyebrow">PUSH-УВЕДОМЛЕНИЯ</span>
          <h1>Уведомления клиентам</h1>
          <p>
            Создавайте сообщения для мобильного приложения и контролируйте
            результат доставки.
          </p>
        </div>
      </header>

      <form
        className="editor-card notification-editor"
        data-testid="notification-form"
        noValidate
        onSubmit={handleSubmit(submit)}
      >
        <div className="editor-title">
          <div>
            <h2>Новая рассылка</h2>
            <p>Получатели: все активные клиенты AlowAlow</p>
          </div>
          <span className="notification-audience">Все клиенты</span>
        </div>
        <div className="form-grid">
          <label>
            <span>Заголовок</span>
            <input
              data-testid="notification-title"
              {...register("title")}
              aria-invalid={Boolean(errors.title)}
              maxLength={160}
              placeholder="Например: Заказ уже рядом"
            />
            <FormFieldError message={errors.title?.message} />
          </label>
          <label>
            <span>Экран после нажатия — необязательно</span>
            <input
              data-testid="notification-deep-link"
              {...register("deepLink")}
              aria-invalid={Boolean(errors.deepLink)}
              maxLength={500}
              placeholder="/orders/current"
            />
            <FormFieldError message={errors.deepLink?.message} />
          </label>
          <label className="wide-field">
            <span>Текст уведомления</span>
            <textarea
              data-testid="notification-body"
              {...register("body")}
              aria-invalid={Boolean(errors.body)}
              maxLength={1000}
              rows={5}
              placeholder="Коротко объясните клиенту, что произошло"
            />
            <FormFieldError message={errors.body?.message} />
          </label>
        </div>
        <div className="notification-send-row">
          <div className="notification-send-note">
            <strong>Отправка начнётся сразу</strong>
            <span>
              Кампания сохранится в истории, даже если у части клиентов сейчас
              нет зарегистрированного телефона.
            </span>
          </div>
          <button
            className="primary-button"
            data-testid="notification-send"
            disabled={actions.create.isPending}
            type="submit"
          >
            {actions.create.isPending ? "Добавляем в очередь…" : "Отправить"}
          </button>
        </div>
      </form>

      {actions.create.isSuccess && (
        <div className="inline-success" role="status">
          Рассылка «{actions.create.data.title}» добавлена в очередь.
        </div>
      )}
      {mutationError && (
        <div className="inline-alert" role="alert">
          {mutationError.message}
        </div>
      )}

      <article className="table-card notification-history">
        <div className="card-title">
          <div>
            <h2>История рассылок</h2>
            <small>
              Статус обновляется, пока backend отправляет сообщения.
            </small>
          </div>
          <span>{campaigns.data?.total ?? 0}</span>
        </div>
        <AsyncPanel
          pending={campaigns.isPending}
          error={campaigns.error}
          onRetry={() => void campaigns.refetch()}
        >
          <DataTable
            columns={columns}
            data={campaigns.data?.items ?? []}
            getRowId={(campaign) => campaign.id}
            empty="Рассылок пока нет"
            label="История push-уведомлений"
            minWidth={760}
          />
          {(campaigns.data?.pages ?? 0) > 1 && (
            <div className="table-pagination">
              <span>
                Страница {page} из {campaigns.data?.pages}
              </span>
              <div>
                <button
                  className="secondary-button compact"
                  data-testid="notification-page-previous"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                  type="button"
                >
                  Назад
                </button>
                <button
                  className="secondary-button compact"
                  data-testid="notification-page-next"
                  disabled={page === campaigns.data?.pages}
                  onClick={() => setPage((value) => value + 1)}
                  type="button"
                >
                  Далее
                </button>
              </div>
            </div>
          )}
        </AsyncPanel>
      </article>
    </section>
  );
}
