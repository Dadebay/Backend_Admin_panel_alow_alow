import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import {
  flattenDeliveryEtraps,
  useAdminDeliveryConfig,
  type DeliveryEtrapWithWelayat,
  type DeliveryWelayat,
} from "@/src/entities/delivery";
import { useDeliveryActions } from "@/src/features/delivery-management";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  deliveryEtrapFormSchema,
  deliverySettingsFormSchema,
  deliveryWelayatFormSchema,
  type DeliveryEtrapFormInput,
  type DeliveryEtrapFormValues,
  type DeliverySettingsFormInput,
  type DeliverySettingsFormValues,
  type DeliveryWelayatFormInput,
  type DeliveryWelayatFormValues,
} from "../model/delivery-form";

type WelayatEditor =
  | { mode: "create" }
  | { mode: "edit"; welayat: DeliveryWelayat };
type EtrapEditor =
  | { mode: "create" }
  | { mode: "edit"; etrap: DeliveryEtrapWithWelayat };

function money(value: number) {
  return `${value.toFixed(2)} TMT`;
}

export function DeliveryManager() {
  const config = useAdminDeliveryConfig();
  const actions = useDeliveryActions();
  const [search, setSearch] = useState("");
  const [welayatId, setWelayatId] = useState("");
  const [welayatEditor, setWelayatEditor] = useState<WelayatEditor | null>(null);
  const [etrapEditor, setEtrapEditor] = useState<EtrapEditor | null>(null);
  const welayatFormRef = useRef<HTMLFormElement>(null);
  const etrapFormRef = useRef<HTMLFormElement>(null);
  const {
    register: registerSettings,
    handleSubmit: handleSettingsSubmit,
    reset: resetSettings,
    formState: { errors: settingsErrors },
  } = useForm<
    DeliverySettingsFormInput,
    unknown,
    DeliverySettingsFormValues
  >({
    resolver: zodResolver(deliverySettingsFormSchema),
    mode: "onBlur",
    defaultValues: {
      fallbackPrice: "15.00",
      fallbackFreeDeliveryThreshold: "150.00",
    },
  });
  const {
    register: registerWelayat,
    handleSubmit: handleWelayatSubmit,
    reset: resetWelayat,
    formState: { errors: welayatErrors },
  } = useForm<
    DeliveryWelayatFormInput,
    unknown,
    DeliveryWelayatFormValues
  >({
    resolver: zodResolver(deliveryWelayatFormSchema),
    mode: "onBlur",
    defaultValues: { nameEn: "", nameRu: "", nameTk: "", sortOrder: "0" },
  });
  const {
    register: registerEtrap,
    handleSubmit: handleEtrapSubmit,
    reset: resetEtrap,
    formState: { errors: etrapErrors },
  } = useForm<DeliveryEtrapFormInput, unknown, DeliveryEtrapFormValues>({
    resolver: zodResolver(deliveryEtrapFormSchema),
    mode: "onBlur",
    defaultValues: {
      welayatId: "",
      nameEn: "",
      nameRu: "",
      nameTk: "",
      queuePosition: "",
      price: "15.00",
      freeDeliveryThreshold: "150.00",
      isDeliveryEnabled: false,
    },
  });

  useEffect(() => {
    if (!config.data) return;
    resetSettings({
      fallbackPrice: config.data.fallbackPrice.toFixed(2),
      fallbackFreeDeliveryThreshold:
        config.data.fallbackFreeDeliveryThreshold?.toFixed(2) ?? "",
    });
  }, [config.data, resetSettings]);

  useEffect(() => {
    if (welayatEditor) {
      welayatFormRef.current?.scrollIntoView({ block: "start" });
    }
  }, [welayatEditor]);

  useEffect(() => {
    if (etrapEditor) {
      etrapFormRef.current?.scrollIntoView({ block: "start" });
    }
  }, [etrapEditor]);

  const allEtraps = useMemo(
    () => flattenDeliveryEtraps(config.data),
    [config.data],
  );
  const visibleEtraps = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ru");
    return allEtraps.filter((etrap) => {
      if (welayatId && etrap.welayatId !== Number(welayatId)) return false;
      if (!normalized) return true;
      return [
        etrap.nameRu,
        etrap.nameTk,
        etrap.nameEn ?? "",
        etrap.welayatNameRu,
        etrap.welayatNameTk,
      ].some((value) => value.toLocaleLowerCase("ru").includes(normalized));
    });
  }, [allEtraps, search, welayatId]);

  const openCreateWelayat = useCallback(() => {
    const sortOrders = config.data?.welayats.map(({ sortOrder }) => sortOrder) ?? [];
    const nextSortOrder = Math.max(0, ...sortOrders) + 1;
    setEtrapEditor(null);
    setWelayatEditor({ mode: "create" });
    resetWelayat({
      nameEn: "",
      nameRu: "",
      nameTk: "",
      sortOrder: String(nextSortOrder),
    });
  }, [config.data?.welayats, resetWelayat]);

  const openWelayatEditor = useCallback(
    (welayat: DeliveryWelayat) => {
      setEtrapEditor(null);
      setWelayatEditor({ mode: "edit", welayat });
      resetWelayat({
        nameEn: welayat.nameEn ?? "",
        nameRu: welayat.nameRu,
        nameTk: welayat.nameTk,
        sortOrder: String(welayat.sortOrder),
      });
    },
    [resetWelayat],
  );

  const openCreateEtrap = useCallback(() => {
    const initialWelayatId =
      welayatId || String(config.data?.welayats[0]?.id ?? "");
    setWelayatEditor(null);
    setEtrapEditor({ mode: "create" });
    resetEtrap({
      welayatId: initialWelayatId,
      nameEn: "",
      nameRu: "",
      nameTk: "",
      queuePosition: "",
      price: config.data?.fallbackPrice.toFixed(2) ?? "15.00",
      freeDeliveryThreshold:
        config.data?.fallbackFreeDeliveryThreshold?.toFixed(2) ?? "",
      isDeliveryEnabled: false,
    });
  }, [config.data, resetEtrap, welayatId]);

  const openEtrapEditor = useCallback(
    (etrap: DeliveryEtrapWithWelayat) => {
      setWelayatEditor(null);
      setEtrapEditor({ mode: "edit", etrap });
      resetEtrap({
        welayatId: String(etrap.welayatId),
        nameEn: etrap.nameEn ?? "",
        nameRu: etrap.nameRu,
        nameTk: etrap.nameTk,
        queuePosition:
          etrap.queuePosition === null ? "" : String(etrap.queuePosition),
        price: etrap.price.toFixed(2),
        freeDeliveryThreshold:
          etrap.freeDeliveryThreshold?.toFixed(2) ?? "",
        isDeliveryEnabled: etrap.isDeliveryEnabled,
      });
    },
    [resetEtrap],
  );

  const welayatColumns = useMemo<ColumnDef<DeliveryWelayat, unknown>[]>(
    () => [
      {
        header: "Велаят",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.nameRu}</strong>
            <small>{row.original.nameTk}</small>
          </div>
        ),
      },
      {
        header: "English",
        cell: ({ row }) =>
          row.original.nameEn || <span className="muted">—</span>,
      },
      { header: "Порядок", accessorKey: "sortOrder" },
      { header: "Районов", cell: ({ row }) => row.original.etraps.length },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            className="secondary-button compact"
            data-testid={`delivery-welayat-edit-${row.original.id}`}
            type="button"
            onClick={() => openWelayatEditor(row.original)}
          >
            Изменить
          </button>
        ),
      },
    ],
    [openWelayatEditor],
  );

  const etrapColumns = useMemo<ColumnDef<DeliveryEtrapWithWelayat, unknown>[]>(
    () => [
      {
        header: "Велаят",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.welayatNameRu}</strong>
            <small>{row.original.welayatNameTk}</small>
          </div>
        ),
      },
      {
        header: "Район / этрап",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.nameRu}</strong>
            <small>{row.original.nameTk}</small>
          </div>
        ),
      },
      {
        header: "Цена",
        cell: ({ row }) => <strong>{money(row.original.price)}</strong>,
      },
      {
        header: "Бесплатно от",
        cell: ({ row }) =>
          row.original.freeDeliveryThreshold === null ? (
            <span className="muted">Не применяется</span>
          ) : (
            money(row.original.freeDeliveryThreshold)
          ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span
            className={row.original.isDeliveryEnabled ? "enabled" : "disabled"}
          >
            {row.original.isDeliveryEnabled
              ? "Доставка доступна"
              : "Выключена"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row-actions">
            <button
              className="secondary-button compact"
              data-testid={`delivery-etrap-edit-${row.original.id}`}
              type="button"
              onClick={() => openEtrapEditor(row.original)}
            >
              Изменить
            </button>
            <button
              className="text-button"
              data-testid={`delivery-etrap-toggle-${row.original.id}`}
              type="button"
              disabled={actions.updateEtrap.isPending}
              onClick={() =>
                actions.updateEtrap.mutate({
                  id: row.original.id,
                  body: {
                    isDeliveryEnabled: !row.original.isDeliveryEnabled,
                  },
                })
              }
            >
              {row.original.isDeliveryEnabled ? "Отключить" : "Включить"}
            </button>
          </div>
        ),
      },
    ],
    [actions.updateEtrap, openEtrapEditor],
  );

  async function saveSettings(values: DeliverySettingsFormValues) {
    await actions.updateSettings.mutateAsync(values);
  }

  async function saveWelayat(values: DeliveryWelayatFormValues) {
    if (!welayatEditor) return;
    if (welayatEditor.mode === "create") {
      await actions.createWelayat.mutateAsync(values);
    } else {
      await actions.updateWelayat.mutateAsync({
        id: welayatEditor.welayat.id,
        body: values,
      });
    }
    setWelayatEditor(null);
  }

  async function saveEtrap(values: DeliveryEtrapFormValues) {
    if (!etrapEditor) return;
    if (etrapEditor.mode === "create") {
      await actions.createEtrap.mutateAsync(values);
    } else {
      await actions.updateEtrap.mutateAsync({
        id: etrapEditor.etrap.id,
        body: values,
      });
    }
    setEtrapEditor(null);
  }

  const mutationError =
    actions.updateSettings.error ||
    actions.createWelayat.error ||
    actions.updateWelayat.error ||
    actions.createEtrap.error ||
    actions.updateEtrap.error;
  const mutationSucceeded =
    actions.updateSettings.isSuccess ||
    actions.createWelayat.isSuccess ||
    actions.updateWelayat.isSuccess ||
    actions.createEtrap.isSuccess ||
    actions.updateEtrap.isSuccess;
  const directoryPending =
    actions.createWelayat.isPending ||
    actions.updateWelayat.isPending ||
    actions.createEtrap.isPending ||
    actions.updateEtrap.isPending;

  return (
    <section
      className="admin-section delivery-manager"
      data-testid="delivery-manager"
    >
      <header className="section-head" data-testid="delivery-manager-header">
        <div>
          <span className="eyebrow">ДОСТАВКА И СПРАВОЧНИК РАЙОНОВ</span>
          <h1>Настройки доставки</h1>
          <p>
            Здесь управляются общие правила, велаяты, районы, названия,
            порядок, доступность и цены. Клиентский API получает только
            включённые районы, а итог всегда рассчитывает backend.
          </p>
        </div>
      </header>

      {mutationError && (
        <div className="inline-alert" role="alert">
          {mutationError instanceof Error ? mutationError.message : ""}
        </div>
      )}
      {mutationSucceeded && (
        <div className="success-banner" role="status">
          Настройки доставки сохранены.
        </div>
      )}

      <form
        className="editor-card delivery-settings-card"
        data-testid="delivery-settings-form"
        noValidate
        onSubmit={handleSettingsSubmit(saveSettings)}
      >
        <div className="editor-title">
          <div>
            <h2>Адрес без выбранного района</h2>
            <p>
              Резервный тариф сохраняет совместимость со старыми версиями
              приложения и ранее сохранёнными адресами.
            </p>
          </div>
        </div>
        <div className="form-grid delivery-price-grid">
          <label>
            <span>Цена доставки, TMT</span>
            <input
              data-testid="delivery-fallback-price"
              {...registerSettings("fallbackPrice")}
              aria-invalid={Boolean(settingsErrors.fallbackPrice)}
              inputMode="decimal"
            />
            <FormFieldError message={settingsErrors.fallbackPrice?.message} />
          </label>
          <label>
            <span>Бесплатно от, TMT</span>
            <input
              data-testid="delivery-fallback-threshold"
              {...registerSettings("fallbackFreeDeliveryThreshold")}
              aria-invalid={Boolean(
                settingsErrors.fallbackFreeDeliveryThreshold,
              )}
              inputMode="decimal"
              placeholder="Пусто — всегда платно"
            />
            <FormFieldError
              message={settingsErrors.fallbackFreeDeliveryThreshold?.message}
            />
          </label>
          <button
            className="primary-button delivery-settings-save"
            data-testid="delivery-settings-save"
            disabled={actions.updateSettings.isPending}
          >
            {actions.updateSettings.isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </form>

      {welayatEditor && (
        <form
          className="editor-card"
          data-testid="delivery-welayat-form"
          noValidate
          onSubmit={handleWelayatSubmit(saveWelayat)}
          ref={welayatFormRef}
        >
          <div className="editor-title">
            <div>
              <h2>
                {welayatEditor.mode === "create"
                  ? "Новый велаят"
                  : `Велаят: ${welayatEditor.welayat.nameRu}`}
              </h2>
              <p>Названия используются клиентами и в выборе района.</p>
            </div>
            <button
              className="text-button"
              data-testid="delivery-welayat-form-close"
              type="button"
              onClick={() => setWelayatEditor(null)}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid delivery-directory-grid">
            <label>
              <span>Название на русском</span>
              <input
                data-testid="delivery-welayat-name-ru"
                {...registerWelayat("nameRu")}
                aria-invalid={Boolean(welayatErrors.nameRu)}
              />
              <FormFieldError message={welayatErrors.nameRu?.message} />
            </label>
            <label>
              <span>Название на туркменском</span>
              <input
                data-testid="delivery-welayat-name-tk"
                {...registerWelayat("nameTk")}
                aria-invalid={Boolean(welayatErrors.nameTk)}
              />
              <FormFieldError message={welayatErrors.nameTk?.message} />
            </label>
            <label>
              <span>Название на английском</span>
              <input
                data-testid="delivery-welayat-name-en"
                {...registerWelayat("nameEn")}
                aria-invalid={Boolean(welayatErrors.nameEn)}
                placeholder="Необязательно"
              />
              <FormFieldError message={welayatErrors.nameEn?.message} />
            </label>
            <label>
              <span>Порядок отображения</span>
              <input
                data-testid="delivery-welayat-sort-order"
                {...registerWelayat("sortOrder")}
                aria-invalid={Boolean(welayatErrors.sortOrder)}
                inputMode="numeric"
              />
              <FormFieldError message={welayatErrors.sortOrder?.message} />
            </label>
            <button
              className="primary-button delivery-directory-save"
              data-testid="delivery-welayat-save"
              disabled={directoryPending}
            >
              {directoryPending ? "Сохраняем…" : "Сохранить велаят"}
            </button>
          </div>
        </form>
      )}

      {etrapEditor && (
        <form
          className="editor-card"
          data-testid="delivery-etrap-form"
          noValidate
          onSubmit={handleEtrapSubmit(saveEtrap)}
          ref={etrapFormRef}
        >
          <div className="editor-title">
            <div>
              <h2>
                {etrapEditor.mode === "create"
                  ? "Новый район / этрап"
                  : etrapEditor.etrap.nameRu}
              </h2>
              <p>
                Все поля этого района, включая тариф и клиентскую доступность,
                управляются здесь.
              </p>
            </div>
            <button
              className="text-button"
              data-testid="delivery-etrap-form-close"
              type="button"
              onClick={() => setEtrapEditor(null)}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid delivery-directory-grid">
            <label>
              <span>Велаят</span>
              <select
                data-testid="delivery-etrap-welayat"
                {...registerEtrap("welayatId")}
                aria-invalid={Boolean(etrapErrors.welayatId)}
              >
                <option value="">Выберите велаят</option>
                {config.data?.welayats.map((welayat) => (
                  <option key={welayat.id} value={welayat.id}>
                    {welayat.nameRu}
                  </option>
                ))}
              </select>
              <FormFieldError message={etrapErrors.welayatId?.message} />
            </label>
            <label>
              <span>Название на русском</span>
              <input
                data-testid="delivery-etrap-name-ru"
                {...registerEtrap("nameRu")}
                aria-invalid={Boolean(etrapErrors.nameRu)}
              />
              <FormFieldError message={etrapErrors.nameRu?.message} />
            </label>
            <label>
              <span>Название на туркменском</span>
              <input
                data-testid="delivery-etrap-name-tk"
                {...registerEtrap("nameTk")}
                aria-invalid={Boolean(etrapErrors.nameTk)}
              />
              <FormFieldError message={etrapErrors.nameTk?.message} />
            </label>
            <label>
              <span>Название на английском</span>
              <input
                data-testid="delivery-etrap-name-en"
                {...registerEtrap("nameEn")}
                aria-invalid={Boolean(etrapErrors.nameEn)}
                placeholder="Необязательно"
              />
              <FormFieldError message={etrapErrors.nameEn?.message} />
            </label>
            <label>
              <span>Порядок внутри велаята</span>
              <input
                data-testid="delivery-etrap-queue-position"
                {...registerEtrap("queuePosition")}
                aria-invalid={Boolean(etrapErrors.queuePosition)}
                inputMode="numeric"
                placeholder="Автоматически по названию"
              />
              <FormFieldError message={etrapErrors.queuePosition?.message} />
            </label>
            <label>
              <span>Цена доставки, TMT</span>
              <input
                data-testid="delivery-etrap-price"
                {...registerEtrap("price")}
                aria-invalid={Boolean(etrapErrors.price)}
                inputMode="decimal"
              />
              <FormFieldError message={etrapErrors.price?.message} />
            </label>
            <label>
              <span>Бесплатно от, TMT</span>
              <input
                data-testid="delivery-etrap-threshold"
                {...registerEtrap("freeDeliveryThreshold")}
                aria-invalid={Boolean(etrapErrors.freeDeliveryThreshold)}
                inputMode="decimal"
                placeholder="Пусто — всегда платно"
              />
              <FormFieldError
                message={etrapErrors.freeDeliveryThreshold?.message}
              />
            </label>
            <label className="check-field">
              <input
                data-testid="delivery-etrap-enabled"
                {...registerEtrap("isDeliveryEnabled")}
                type="checkbox"
              />
              Район доступен клиентам
            </label>
            <button
              className="primary-button delivery-directory-save"
              data-testid="delivery-etrap-save"
              disabled={directoryPending}
            >
              {directoryPending ? "Сохраняем…" : "Сохранить район"}
            </button>
          </div>
        </form>
      )}

      <article className="table-card" data-testid="delivery-welayat-table-card">
        <div className="card-title delivery-table-title">
          <div>
            <h2>Велаяты</h2>
            <span>{config.data?.welayats.length ?? 0} записей</span>
          </div>
          <button
            className="primary-button compact"
            data-testid="delivery-welayat-create"
            type="button"
            onClick={openCreateWelayat}
          >
            Добавить велаят
          </button>
        </div>
        <AsyncPanel
          pending={config.isPending}
          error={config.error}
          onRetry={() => void config.refetch()}
        >
          <DataTable
            columns={welayatColumns}
            data={config.data?.welayats ?? []}
            empty="Добавьте первый велаят, затем создайте его районы."
            getRowId={(welayat) => String(welayat.id)}
            label="Справочник велаятов доставки"
            minWidth={720}
          />
        </AsyncPanel>
      </article>

      <article className="table-card" data-testid="delivery-etrap-table-card">
        <div className="card-title delivery-table-title">
          <div>
            <h2>Районы и этрапы</h2>
            <span>
              {visibleEtraps.length} из {allEtraps.length}
            </span>
          </div>
          <div className="delivery-filters">
            <label>
              <span className="sr-only">Велаят</span>
              <select
                aria-label="Фильтр по велаяту"
                data-testid="delivery-welayat-filter"
                value={welayatId}
                onChange={(event) => setWelayatId(event.target.value)}
              >
                <option value="">Все велаяты</option>
                {config.data?.welayats.map((welayat) => (
                  <option key={welayat.id} value={welayat.id}>
                    {welayat.nameRu}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="Поиск района"
              data-testid="delivery-etrap-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти район"
            />
            <button
              className="primary-button compact"
              data-testid="delivery-etrap-create"
              type="button"
              disabled={!config.data?.welayats.length}
              onClick={openCreateEtrap}
            >
              Добавить район
            </button>
          </div>
        </div>
        <p className="delivery-directory-note">
          Районы с историей не удаляются: отключите район, чтобы скрыть его от
          клиентов и сохранить старые адреса и чеки.
        </p>
        <AsyncPanel
          pending={config.isPending}
          error={config.error}
          onRetry={() => void config.refetch()}
        >
          <DataTable
            columns={etrapColumns}
            data={visibleEtraps}
            empty="Районы не найдены. Измените фильтр или создайте новый район."
            getRowId={(etrap) => String(etrap.id)}
            label="Тарифы доставки по районам"
            minWidth={920}
          />
        </AsyncPanel>
      </article>
    </section>
  );
}
