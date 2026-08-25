import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type {
  CreateReceiptPrinter,
  ReceiptPrinter,
  UpdateReceiptPrinter,
} from "@/src/entities/catalog";
import { FormFieldError } from "@/src/shared/forms";
import {
  receiptPrinterFormSchema,
  type ReceiptPrinterFormValues,
} from "../model/catalog-forms";

const emptyPrinter: ReceiptPrinterFormValues = {
  name: "",
  ipAddress: "",
  port: 9100,
  transport: "RAW_TCP",
  isActive: true,
};

export function ReceiptPrinterRegistry({
  printers,
  canEdit,
  isLoading,
  isPending,
  error,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
}: {
  printers: ReceiptPrinter[];
  canEdit: boolean;
  isLoading: boolean;
  isPending: boolean;
  error: string;
  onRetry: () => void;
  onCreate: (body: CreateReceiptPrinter) => Promise<unknown>;
  onUpdate: (id: string, body: UpdateReceiptPrinter) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<ReceiptPrinter | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReceiptPrinterFormValues>({
    resolver: zodResolver(receiptPrinterFormSchema),
    mode: "onBlur",
    defaultValues: emptyPrinter,
  });

  function openCreate() {
    setEditing(null);
    reset(emptyPrinter);
    setShowForm(true);
  }

  function openEdit(printer: ReceiptPrinter) {
    setEditing(printer);
    reset({
      name: printer.name,
      ipAddress: printer.ipAddress,
      port: printer.port,
      transport: printer.transport,
      isActive: printer.isActive,
    });
    setShowForm(true);
  }

  async function submit(values: ReceiptPrinterFormValues) {
    try {
      if (editing) {
        await onUpdate(editing.id, values);
      } else {
        await onCreate(values);
      }
    } catch {
      return;
    }
    setEditing(null);
    setShowForm(false);
    reset(emptyPrinter);
  }

  async function togglePrinter(printer: ReceiptPrinter) {
    try {
      await onUpdate(printer.id, {
        name: printer.name,
        ipAddress: printer.ipAddress,
        port: printer.port,
        transport: printer.transport,
        isActive: !printer.isActive,
      });
    } catch {
      // The mutation exposes its API error through the inline alert.
    }
  }

  async function deletePrinter(id: string) {
    try {
      await onDelete(id);
      setDeleteId(null);
    } catch {
      // Referenced printers remain visible and the inline alert explains why.
    }
  }

  return (
    <section
      className="table-card receipt-printer-registry"
      data-testid="receipt-printer-registry"
      aria-labelledby="receipt-printer-registry-title"
    >
      <header>
        <div>
          <span className="eyebrow">ЛОКАЛЬНАЯ СЕТЬ</span>
          <h2 id="receipt-printer-registry-title">Чековые аппараты</h2>
          <p>
            Добавьте аппарат один раз, затем выбирайте его для главного чека,
            категории или отдельного блюда.
          </p>
        </div>
        {canEdit && (
          <button
            className="secondary-button"
            data-testid="receipt-printer-create-open"
            type="button"
            onClick={openCreate}
          >
            + Добавить аппарат
          </button>
        )}
      </header>

      {showForm && canEdit && (
        <form
          className="receipt-printer-editor"
          data-testid="receipt-printer-form"
          noValidate
          onSubmit={handleSubmit(submit)}
        >
          <label>
            <span>Название</span>
            <input
              data-testid="receipt-printer-name"
              {...register("name")}
              aria-invalid={Boolean(errors.name)}
              placeholder="Пицца — кухня"
            />
            <FormFieldError message={errors.name?.message} />
          </label>
          <label>
            <span>Локальный IP</span>
            <input
              data-testid="receipt-printer-ip"
              {...register("ipAddress")}
              aria-invalid={Boolean(errors.ipAddress)}
              inputMode="decimal"
              placeholder="192.168.123.100"
            />
            <FormFieldError message={errors.ipAddress?.message} />
          </label>
          <label>
            <span>Порт</span>
            <input
              data-testid="receipt-printer-port"
              {...register("port", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.port)}
              min="1"
              max="65535"
              type="number"
            />
            <FormFieldError message={errors.port?.message} />
          </label>
          <label>
            <span>Протокол</span>
            <select
              data-testid="receipt-printer-transport"
              {...register("transport")}
            >
              <option value="RAW_TCP">RAW TCP / ESC-POS</option>
              <option value="JSPEED_HTTP">J-Speed HTTP</option>
            </select>
            <small>
              Для обычных LAN X-принтеров обычно RAW TCP, порт 9100.
            </small>
          </label>
          <label className="check-field">
            <input
              data-testid="receipt-printer-active"
              {...register("isActive")}
              type="checkbox"
            />
            Аппарат активен
          </label>
          <div className="receipt-printer-editor-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Отмена
            </button>
            <button
              className="primary-button"
              data-testid="receipt-printer-save"
              disabled={isPending}
            >
              {isPending
                ? "Сохраняем…"
                : editing
                  ? "Сохранить изменения"
                  : "Добавить аппарат"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="receipt-printer-empty">Загружаем аппараты…</div>
      ) : printers.length ? (
        <div className="receipt-printer-list">
          {printers.map((printer) => (
            <article
              className="receipt-printer-row"
              data-testid={`receipt-printer-${printer.id}`}
              key={printer.id}
            >
              <div>
                <strong>{printer.name}</strong>
                <span>
                  {printer.ipAddress}:{printer.port} ·{" "}
                  {printer.transport === "RAW_TCP"
                    ? "RAW TCP / ESC-POS"
                    : "J-Speed HTTP"}
                </span>
              </div>
              <span className={printer.isActive ? "enabled" : "disabled"}>
                {printer.isActive ? "Активен" : "Отключён"}
              </span>
              {canEdit && (
                <div className="row-actions">
                  <button
                    className="secondary-button compact"
                    data-testid={`receipt-printer-edit-${printer.id}`}
                    disabled={isPending}
                    type="button"
                    onClick={() => openEdit(printer)}
                  >
                    Изменить
                  </button>
                  <button
                    className="text-button compact"
                    data-testid={`receipt-printer-toggle-${printer.id}`}
                    disabled={isPending}
                    type="button"
                    onClick={() => void togglePrinter(printer)}
                  >
                    {printer.isActive ? "Отключить" : "Включить"}
                  </button>
                  <button
                    className="text-button compact danger"
                    data-testid={`receipt-printer-delete-${printer.id}`}
                    disabled={isPending}
                    type="button"
                    onClick={() => {
                      if (deleteId !== printer.id) {
                        setDeleteId(printer.id);
                        return;
                      }
                      void deletePrinter(printer.id);
                    }}
                  >
                    {deleteId === printer.id
                      ? "Подтвердить удаление"
                      : "Удалить"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="receipt-printer-empty">
          <span>Аппараты ещё не добавлены.</span>
          <button
            className="text-button compact"
            type="button"
            onClick={onRetry}
          >
            Обновить
          </button>
        </div>
      )}
      <small className="receipt-printer-note">
        IP должен быть адресом локальной сети. Отключённый аппарат нельзя
        назначить новому маршруту; существующий маршрут перестаёт печатать до
        повторного включения.
      </small>
    </section>
  );
}
