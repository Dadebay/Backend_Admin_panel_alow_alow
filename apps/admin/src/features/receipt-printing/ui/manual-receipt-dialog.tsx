import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { useForm } from "react-hook-form";
import { useReceiptPrinters } from "@/src/entities/catalog";
import type { Order } from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import { useReceiptPrinting } from "../api/use-receipt-printing";
import {
  manualReceiptFormSchema,
  manualReceiptItemRoutes,
  type ManualReceiptFormValues,
} from "../model/manual-receipt-form";

type Plan = components["schemas"]["ReceiptPrintPlanResponseDto"];

export function ManualReceiptDialog({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { authorizedRequest, session } = useSession();
  const canRoute =
    session?.user.role === "ADMIN" || session?.user.role === "SUPER_ADMIN";
  const plan = useQuery({
    queryKey: ["manual-receipt-plan", order.id],
    queryFn: ({ signal }) =>
      authorizedRequest<Plan>(`/orders/${order.id}/receipt-print-plan`, {
        signal,
      }),
    staleTime: 0,
  });
  const printers = useReceiptPrinters();
  const print = useReceiptPrinting();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualReceiptFormValues>({
    resolver: zodResolver(manualReceiptFormSchema),
    values: {
      routes: order.items.map((item) => ({
        itemId: item.id,
        destination: "DEFAULT",
      })),
    },
  });
  const assigned = new Map(
    plan.data?.jobs.flatMap((job) =>
      job.items.map(
        (item) => [item.id, `${job.printerIp}:${job.printerPort}`] as const,
      ),
    ) ?? [],
  );
  const submit = (values: ManualReceiptFormValues) => {
    print.mutate(
      {
        orderId: order.id,
        itemRoutes: manualReceiptItemRoutes(values),
      },
      { onSuccess: onClose },
    );
  };
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal editor-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-receipt-title"
        noValidate
        onSubmit={handleSubmit(submit)}
        data-testid="manual-receipt-form"
      >
        <h2 id="manual-receipt-title">Печать заказа №{order.number}</h2>
        <p>
          Выберите, какие блюда печатать и на каком аппарате. «Не печатать»
          убирает блюдо и из главного, и из кухонного чека этой ручной печати.
          Сумма в частичном чеке остаётся суммой всего заказа. Ручная печать
          отправится сразу и уберёт ожидающие автоматические чеки из очереди.
        </p>
        {(plan.isPending || printers.isPending) && (
          <p>Загружаем маршруты печати…</p>
        )}
        {(plan.isError || printers.isError) && (
          <p role="alert">
            Не удалось загрузить аппараты.{" "}
            <button
              type="button"
              data-testid="manual-receipt-retry"
              onClick={() => {
                void plan.refetch();
                void printers.refetch();
              }}
            >
              Повторить
            </button>
          </p>
        )}
        {plan.data && printers.data && (
          <>
            <p>
              Главная касса:{" "}
              {plan.data.mainJob
                ? `${plan.data.mainJob.printerIp} · ${plan.data.mainCopies} копии`
                : "не настроена"}
              .
            </p>
            {order.items.map((item, index) => (
              <label key={item.id}>
                <span>
                  {item.productName}
                  {item.variantName ? ` · ${item.variantName}` : ""} ×{" "}
                  {item.quantity}
                </span>
                <input type="hidden" {...register(`routes.${index}.itemId`)} />
                <select
                  data-testid={`manual-receipt-route-${item.id}`}
                  {...register(`routes.${index}.destination`)}
                >
                  <option value="DEFAULT">
                    Текущий маршрут:{" "}
                    {assigned.get(item.id) ?? "нет кухонного аппарата"}
                  </option>
                  {canRoute && <option value="SKIP">Не печатать блюдо</option>}
                  {canRoute && plan.data.mainJob && (
                    <option value="MAIN">Только главная касса</option>
                  )}
                  {canRoute &&
                    printers.data
                      .filter((printer) => printer.isActive)
                      .map((printer) => (
                        <option key={printer.id} value={printer.id}>
                          {printer.name} · {printer.ipAddress}:{printer.port}
                        </option>
                      ))}
                </select>
                <FormFieldError
                  message={errors.routes?.[index]?.destination?.message}
                />
              </label>
            ))}
            <FormFieldError message={errors.routes?.message} />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                data-testid="manual-receipt-cancel"
                onClick={onClose}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="primary-button"
                data-testid="manual-receipt-submit"
                disabled={print.isPending}
              >
                Напечатать сейчас
              </button>
            </div>
            {print.isError && <p role="alert">{print.error.message}</p>}
          </>
        )}
      </form>
    </div>
  );
}
