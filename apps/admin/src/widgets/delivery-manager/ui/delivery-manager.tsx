import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import {
  flattenDeliveryEtraps,
  useAdminDeliveryConfig,
  type DeliveryEtrapWithWelayat,
  type DeliveryZonePoint,
  type DeliveryWelayat,
} from "@/src/entities/delivery";
import { useDeliveryActions } from "@/src/features/delivery-management";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable, EditIcon, PowerIcon } from "@/src/shared/ui";
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

import { NightDeliverySchedule } from "./night-delivery-schedule";

const DeliveryZoneMap = lazy(() =>
  import("./delivery-zone-map").then((module) => ({
    default: module.DeliveryZoneMap,
  })),
);

type WelayatEditor =
  { mode: "create" } | { mode: "edit"; welayat: DeliveryWelayat };
type EtrapEditor =
  { mode: "create" } | { mode: "edit"; etrap: DeliveryEtrapWithWelayat };

function money(value: number) {
  return `${value.toFixed(2)} TMT`;
}

export function DeliveryManager() {
  const config = useAdminDeliveryConfig();
  const actions = useDeliveryActions();
  const [search, setSearch] = useState("");
  const [welayatId, setWelayatId] = useState("");
  const [welayatEditor, setWelayatEditor] = useState<WelayatEditor | null>(
    null,
  );
  const [etrapEditor, setEtrapEditor] = useState<EtrapEditor | null>(null);
  const [zoneDraft, setZoneDraft] = useState<DeliveryZonePoint[]>([]);
  const [zoneError, setZoneError] = useState("");
  const welayatFormRef = useRef<HTMLFormElement>(null);
  const etrapFormRef = useRef<HTMLFormElement>(null);
  const {
    register: registerSettings,
    handleSubmit: handleSettingsSubmit,
    reset: resetSettings,
    formState: { errors: settingsErrors },
  } = useForm<DeliverySettingsFormInput, unknown, DeliverySettingsFormValues>({
    resolver: zodResolver(deliverySettingsFormSchema),
    mode: "onBlur",
    defaultValues: {
      mapPricingEnabled: false,
      fallbackPrice: "15.00",
      fallbackNightPrice: "15.00",
      fallbackNightFreeDeliveryThreshold: "150.00",
      fallbackFreeDeliveryThreshold: "150.00",
    },
  });
  const {
    register: registerWelayat,
    handleSubmit: handleWelayatSubmit,
    reset: resetWelayat,
    formState: { errors: welayatErrors },
  } = useForm<DeliveryWelayatFormInput, unknown, DeliveryWelayatFormValues>({
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
      nightPrice: "15.00",
      nightFreeDeliveryThreshold: "150.00",
      freeDeliveryThreshold: "150.00",
      isDeliveryEnabled: false,
    },
  });

  useEffect(() => {
    if (!config.data) return;
    resetSettings({
      mapPricingEnabled: config.data.mapPricingEnabled,
      fallbackPrice: config.data.fallbackPrice.toFixed(2),
      fallbackNightPrice: config.data.fallbackNightPrice.toFixed(2),
      fallbackNightFreeDeliveryThreshold:
        config.data.fallbackNightFreeDeliveryThreshold?.toFixed(2) ?? "",
      fallbackFreeDeliveryThreshold:
        config.data.fallbackFreeDeliveryThreshold?.toFixed(2) ?? "",
    });
  }, [config.data, resetSettings]);

  useEffect(() => {
    if (!welayatEditor) return;
    welayatFormRef.current
      ?.querySelector<HTMLElement>("input, select")
      ?.focus();
  }, [welayatEditor]);

  useEffect(() => {
    if (!etrapEditor) return;
    etrapFormRef.current?.querySelector<HTMLElement>("input, select")?.focus();
  }, [etrapEditor]);

  useEffect(() => {
    if (!welayatEditor && !etrapEditor) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setWelayatEditor(null);
      setEtrapEditor(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [welayatEditor, etrapEditor]);

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
    const sortOrders =
      config.data?.welayats.map(({ sortOrder }) => sortOrder) ?? [];
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
    setZoneDraft([]);
    setZoneError("");
    resetEtrap({
      welayatId: initialWelayatId,
      nameEn: "",
      nameRu: "",
      nameTk: "",
      queuePosition: "",
      price: config.data?.fallbackPrice.toFixed(2) ?? "15.00",
      nightPrice: config.data?.fallbackNightPrice.toFixed(2) ?? "15.00",
      nightFreeDeliveryThreshold:
        config.data?.fallbackNightFreeDeliveryThreshold?.toFixed(2) ?? "",
      freeDeliveryThreshold:
        config.data?.fallbackFreeDeliveryThreshold?.toFixed(2) ?? "",
      isDeliveryEnabled: false,
    });
  }, [config.data, resetEtrap, welayatId]);

  const openEtrapEditor = useCallback(
    (etrap: DeliveryEtrapWithWelayat) => {
      setWelayatEditor(null);
      setEtrapEditor({ mode: "edit", etrap });
      setZoneDraft(etrap.deliveryZone ? [...etrap.deliveryZone] : []);
      setZoneError("");
      resetEtrap({
        welayatId: String(etrap.welayatId),
        nameEn: etrap.nameEn ?? "",
        nameRu: etrap.nameRu,
        nameTk: etrap.nameTk,
        queuePosition:
          etrap.queuePosition === null ? "" : String(etrap.queuePosition),
        price: etrap.price.toFixed(2),
        nightPrice: etrap.nightPrice.toFixed(2),
        nightFreeDeliveryThreshold:
          etrap.nightFreeDeliveryThreshold?.toFixed(2) ?? "",
        freeDeliveryThreshold: etrap.freeDeliveryThreshold?.toFixed(2) ?? "",
        isDeliveryEnabled: etrap.isDeliveryEnabled,
      });
    },
    [resetEtrap],
  );

  // Velayat listesi kurulum ekrani: adi, kac rayonu oldugu ve duzenleme
  // dugmesi yeter. Ingilizce ad ile siralama numarasi modalda duruyor,
  // listede yer kaplamalarinin bir karsiligi yok.
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
        header: "Районов",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="count-pill">{row.original.etraps.length}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row-actions">
            <button
              aria-label="Изменить"
              title="Изменить"
              className="secondary-button compact row-icon-button"
              data-testid={`delivery-welayat-edit-${row.original.id}`}
              type="button"
              onClick={() => openWelayatEditor(row.original)}
            >
              <EditIcon />
            </button>
          </div>
        ),
      },
    ],
    [openWelayatEditor],
  );

  const etrapColumns = useMemo<ColumnDef<DeliveryEtrapWithWelayat, unknown>[]>(
    () => [
      {
        // Panel tek dilli (index.html: lang="ru"), bu yuzden listede yalnizca
        // rusca ad gosteriliyor. Panele dil secimi eklenirse degistirilecek
        // tek yer burasi.
        header: "Район / этрап",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.nameRu}</strong>
            <small>{row.original.welayatNameRu}</small>
          </div>
        ),
      },
      {
        header: "Цена",
        meta: { align: "end" },
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong className="delivery-price-value">
              День: {money(row.original.price)}
            </strong>
            <small>Ночь: {money(row.original.nightPrice)}</small>
          </div>
        ),
      },
      {
        header: "Бесплатно от",
        meta: { align: "end" },
        cell: ({ row }) => (
          <div className="primary-cell">
            <span>
              День:{" "}
              {row.original.freeDeliveryThreshold === null
                ? "всегда платно"
                : money(row.original.freeDeliveryThreshold)}
            </span>
            <small>
              Ночь:{" "}
              {row.original.nightFreeDeliveryThreshold === null
                ? "всегда платно"
                : money(row.original.nightFreeDeliveryThreshold)}
            </small>
          </div>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span
            className={`state-pill ${
              row.original.isDeliveryEnabled ? "is-on" : "is-off"
            }`}
          >
            {row.original.isDeliveryEnabled ? "Доставка" : "Выключена"}
          </span>
        ),
      },
      {
        header: "Карта",
        cell: ({ row }) => (
          <span
            className={`state-pill ${
              row.original.deliveryZone ? "is-on" : "is-off"
            }`}
          >
            {row.original.deliveryZone
              ? `${row.original.deliveryZone.length} точек`
              : "Без зоны"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row-actions">
            <button
              aria-label="Изменить"
              title="Изменить"
              className="secondary-button compact row-icon-button"
              data-testid={`delivery-etrap-edit-${row.original.id}`}
              type="button"
              onClick={() => openEtrapEditor(row.original)}
            >
              <EditIcon />
            </button>
            <button
              aria-label={
                row.original.isDeliveryEnabled ? "Отключить" : "Включить"
              }
              title={row.original.isDeliveryEnabled ? "Отключить" : "Включить"}
              className="text-button row-icon-button"
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
              <PowerIcon />
            </button>
          </div>
        ),
      },
    ],
    [actions.updateEtrap, openEtrapEditor],
  );

  async function saveSettings(values: DeliverySettingsFormValues) {
    try {
      await actions.updateSettings.mutateAsync({
        ...values,
        version: config.data?.version,
      });
    } catch {
      /* The mutation error is displayed above the form. */
    }
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
    if (zoneDraft.length > 0 && zoneDraft.length < 3) {
      setZoneError("Поставьте минимум 3 точки или очистите границу полностью.");
      return;
    }
    if (
      values.isDeliveryEnabled &&
      config.data?.mapPricingEnabled &&
      zoneDraft.length < 3
    ) {
      setZoneError(
        "Для включённого района нужна граница, пока расчёт по карте активен.",
      );
      return;
    }
    setZoneError("");
    const body = {
      ...values,
      deliveryZone: zoneDraft.length >= 3 ? zoneDraft : null,
    };
    try {
      if (etrapEditor.mode === "create") {
        await actions.createEtrap.mutateAsync(body);
      } else {
        await actions.updateEtrap.mutateAsync({
          id: etrapEditor.etrap.id,
          body: { ...body, version: etrapEditor.etrap.version },
        });
      }
      setEtrapEditor(null);
    } catch {
      /* Preserve the entered prices and display the mutation error. */
    }
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
  // Kapali bir <details> icindeki alanin hatasi gorunmez kalir. Hata varken
  // acik tutuyoruz; hata yokken `undefined` birakip kullanicinin kendi actigi
  // durumu bozmuyoruz.
  const welayatAdvancedError = Boolean(
    welayatErrors.nameEn || welayatErrors.sortOrder,
  );
  const etrapAdvancedError = Boolean(
    etrapErrors.nameEn || etrapErrors.queuePosition,
  );

  return (
    <section
      className="admin-section delivery-manager"
      data-testid="delivery-manager"
    >
      {mutationError && (
        <div className="inline-alert" role="alert">
          {mutationError instanceof Error ? mutationError.message : ""}
          <button
            type="button"
            className="text-button"
            data-testid="delivery-config-reload"
            onClick={() => void config.refetch()}
          >
            Обновить настройки
          </button>
        </div>
      )}
      {mutationSucceeded && (
        <div className="success-banner" role="status">
          Настройки доставки сохранены.
        </div>
      )}

      <article
        className="table-card delivery-zone-overview"
        data-testid="delivery-zone-overview"
      >
        <div className="card-title delivery-zone-overview-title">
          <div>
            <h2>Тарифные зоны на карте</h2>
            <small>
              Нажмите на границу района, чтобы изменить её и назначить цену.
              Текст адреса не участвует в расчёте после включения режима карты.
            </small>
          </div>
          <span
            className={`state-pill ${
              config.data?.mapPricingEnabled ? "is-on" : "is-off"
            }`}
            data-testid="delivery-map-pricing-state"
          >
            {config.data?.mapPricingEnabled
              ? "Расчёт по карте включён"
              : "Подготовка зон"}
          </span>
        </div>
        <AsyncPanel
          pending={config.isPending}
          error={config.error}
          onRetry={() => void config.refetch()}
        >
          <Suspense
            fallback={
              <div
                className="empty-state"
                data-testid="delivery-zone-map-loading"
              >
                Загружаем карту тарифов…
              </div>
            }
          >
            <DeliveryZoneMap onSelect={openEtrapEditor} zones={visibleEtraps} />
          </Suspense>
          <div
            className="delivery-zone-summary"
            data-testid="delivery-zone-summary"
          >
            <span>
              С границей:{" "}
              {allEtraps.filter(({ deliveryZone }) => deliveryZone).length}
            </span>
            <span>
              Без границы:{" "}
              {allEtraps.filter(({ deliveryZone }) => !deliveryZone).length}
            </span>
          </div>
        </AsyncPanel>
      </article>

      {welayatEditor && (
        <div
          className="modal-backdrop"
          data-testid="delivery-welayat-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setWelayatEditor(null);
          }}
        >
          <section
            aria-labelledby="delivery-welayat-form-title"
            aria-modal="true"
            className="modal delivery-directory-modal"
            role="dialog"
          >
            <form
              data-testid="delivery-welayat-form"
              noValidate
              onSubmit={handleWelayatSubmit(saveWelayat)}
              ref={welayatFormRef}
            >
              <header className="modal-head">
                <div>
                  <h2 id="delivery-welayat-form-title">
                    {welayatEditor.mode === "create"
                      ? "Новый велаят"
                      : `Велаят: ${welayatEditor.welayat.nameRu}`}
                  </h2>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  data-testid="delivery-welayat-form-close"
                  type="button"
                  onClick={() => setWelayatEditor(null)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M6 6l8 8M14 6l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.9"
                    />
                  </svg>
                </button>
              </header>
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
              </div>
              <details
                className="delivery-advanced-fields"
                open={welayatAdvancedError || undefined}
              >
                <summary>Дополнительно</summary>
                <div className="form-grid delivery-directory-grid">
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
                  <label className="delivery-sort-field">
                    <span>Порядок отображения</span>
                    <input
                      data-testid="delivery-welayat-sort-order"
                      {...registerWelayat("sortOrder")}
                      aria-invalid={Boolean(welayatErrors.sortOrder)}
                      inputMode="numeric"
                    />
                    <FormFieldError
                      message={welayatErrors.sortOrder?.message}
                    />
                  </label>
                </div>
              </details>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setWelayatEditor(null)}
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  data-testid="delivery-welayat-save"
                  disabled={directoryPending}
                >
                  {directoryPending ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {etrapEditor && (
        <div
          className="modal-backdrop"
          data-testid="delivery-etrap-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEtrapEditor(null);
          }}
        >
          <section
            aria-labelledby="delivery-etrap-form-title"
            aria-modal="true"
            className="modal delivery-directory-modal delivery-zone-modal"
            role="dialog"
          >
            <form
              data-testid="delivery-etrap-form"
              noValidate
              onSubmit={handleEtrapSubmit(saveEtrap)}
              ref={etrapFormRef}
            >
              <header className="modal-head">
                <div>
                  <h2 id="delivery-etrap-form-title">
                    {etrapEditor.mode === "create"
                      ? "Новый район"
                      : etrapEditor.etrap.nameRu}
                  </h2>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  data-testid="delivery-etrap-form-close"
                  type="button"
                  onClick={() => setEtrapEditor(null)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M6 6l8 8M14 6l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.9"
                    />
                  </svg>
                </button>
              </header>
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
                  <span>Дневная цена, TMT</span>
                  <input
                    data-testid="delivery-etrap-price"
                    {...registerEtrap("price")}
                    aria-invalid={Boolean(etrapErrors.price)}
                    inputMode="decimal"
                  />
                  <FormFieldError message={etrapErrors.price?.message} />
                </label>
                <label>
                  <span>Днём бесплатно от, TMT</span>
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

                <label>
                  <span>Ночная цена, TMT</span>
                  <input
                    data-testid="delivery-etrap-night-price"
                    {...registerEtrap("nightPrice")}
                    inputMode="decimal"
                    aria-invalid={Boolean(etrapErrors.nightPrice)}
                  />
                  <FormFieldError message={etrapErrors.nightPrice?.message} />
                </label>
                <label>
                  <span>Ночью бесплатно от, TMT</span>
                  <input
                    data-testid="delivery-etrap-night-threshold"
                    {...registerEtrap("nightFreeDeliveryThreshold")}
                    inputMode="decimal"
                    placeholder="Пусто — ночью всегда платно"
                    aria-invalid={Boolean(
                      etrapErrors.nightFreeDeliveryThreshold,
                    )}
                  />
                  <FormFieldError
                    message={etrapErrors.nightFreeDeliveryThreshold?.message}
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
              </div>
              <section
                className="delivery-zone-editor"
                data-testid="delivery-zone-editor"
              >
                <div className="delivery-zone-editor-copy">
                  <div>
                    <h3>Граница тарифа</h3>
                    <p>
                      Обведите район последовательными кликами. Цена выше будет
                      применяться, только когда адресная точка находится внутри
                      этой границы.
                    </p>
                  </div>
                  {zoneDraft.length >= 3 && (
                    <span className="state-pill is-on">Зона готова</span>
                  )}
                </div>
                <Suspense
                  fallback={
                    <div
                      className="empty-state"
                      data-testid="delivery-zone-editor-loading"
                    >
                      Загружаем редактор карты…
                    </div>
                  }
                >
                  <DeliveryZoneMap
                    draft={zoneDraft}
                    editable
                    onDraftChange={(points) => {
                      setZoneDraft(points);
                      setZoneError("");
                    }}
                    selectedId={
                      etrapEditor.mode === "edit" ? etrapEditor.etrap.id : null
                    }
                    zones={allEtraps.filter(
                      ({ id }) =>
                        etrapEditor.mode !== "edit" ||
                        id !== etrapEditor.etrap.id,
                    )}
                  />
                </Suspense>
                {zoneError && (
                  <p
                    className="field-error"
                    data-testid="delivery-zone-error"
                    role="alert"
                  >
                    {zoneError}
                  </p>
                )}
              </section>
              <details
                className="delivery-advanced-fields"
                open={etrapAdvancedError || undefined}
              >
                <summary>Дополнительно</summary>
                <div className="form-grid delivery-directory-grid">
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
                    <FormFieldError
                      message={etrapErrors.queuePosition?.message}
                    />
                  </label>
                </div>
              </details>
              <p className="delivery-directory-note">
                Район нельзя удалить — выключите его, чтобы скрыть от клиентов и
                сохранить старые адреса и чеки.
              </p>
              {(actions.updateEtrap.error || actions.createEtrap.error) && (
                <div className="inline-alert" role="alert">
                  {
                    (actions.updateEtrap.error || actions.createEtrap.error)
                      ?.message
                  }
                  <button
                    type="button"
                    className="text-button"
                    data-testid="delivery-etrap-reload"
                    onClick={() => {
                      setEtrapEditor(null);
                      actions.updateEtrap.reset();
                      actions.createEtrap.reset();
                      void config.refetch();
                    }}
                  >
                    Обновить список районов
                  </button>
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEtrapEditor(null)}
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  data-testid="delivery-etrap-save"
                  disabled={directoryPending}
                >
                  {directoryPending ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <NightDeliverySchedule
        config={config.data}
        onReload={() => void config.refetch()}
      />

      {/* Gunluk is tek sey: bir rayonun fiyatini degistirmek ya da acip
          kapatmak. Sayfanin tamami o liste; velayat sozlugu ve yedek tarif
          kurulumluk oldugu icin asagida kapali duruyor. */}
      <article className="table-card" data-testid="delivery-etrap-table-card">
        <div className="card-title delivery-table-title">
          <div>
            <h2>Районы</h2>
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
            minWidth={760}
            pageSize={25}
          />
        </AsyncPanel>
      </article>

      <details className="delivery-setup" data-testid="delivery-setup">
        <summary>
          <span>
            Велаяты и резервный тариф
            <small>Нужны при настройке, а не в ежедневной работе</small>
          </span>
          <b>{config.data?.welayats.length ?? 0}</b>
        </summary>

        <div className="delivery-setup-body">
          <article
            className="table-card"
            data-testid="delivery-welayat-table-card"
          >
            <div className="card-title delivery-table-title">
              <div>
                <h2>Велаяты</h2>
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
                minWidth={420}
              />
            </AsyncPanel>
          </article>

          <form
            className="editor-card delivery-settings-card"
            data-testid="delivery-settings-form"
            noValidate
            onSubmit={handleSettingsSubmit(saveSettings)}
          >
            <div className="editor-title">
              <div>
                <h2>Резервный тариф</h2>
                <p>Применяется, когда у адреса нет района.</p>
              </div>
            </div>
            <label className="delivery-map-pricing-toggle">
              <input
                data-testid="delivery-map-pricing-enabled"
                {...registerSettings("mapPricingEnabled")}
                type="checkbox"
              />
              <span>
                <strong>Определять тариф только по карте</strong>
                <small>
                  Включайте после отрисовки всех активных районов. Backend не
                  позволит включить режим, пока у включённого района нет зоны.
                </small>
              </span>
            </label>
            <div className="form-grid delivery-price-grid">
              <label>
                <span>Дневная цена, TMT</span>
                <input
                  data-testid="delivery-fallback-price"
                  {...registerSettings("fallbackPrice")}
                  aria-invalid={Boolean(settingsErrors.fallbackPrice)}
                  inputMode="decimal"
                />
                <FormFieldError
                  message={settingsErrors.fallbackPrice?.message}
                />
              </label>
              <label>
                <span>Днём бесплатно от, TMT</span>
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
                  message={
                    settingsErrors.fallbackFreeDeliveryThreshold?.message
                  }
                />
              </label>

              <label>
                <span>Ночная цена, TMT</span>
                <input
                  data-testid="delivery-fallback-night-price"
                  {...registerSettings("fallbackNightPrice")}
                  inputMode="decimal"
                  aria-invalid={Boolean(settingsErrors.fallbackNightPrice)}
                />
                <FormFieldError
                  message={settingsErrors.fallbackNightPrice?.message}
                />
              </label>
              <label>
                <span>Ночью бесплатно от, TMT</span>
                <input
                  data-testid="delivery-fallback-night-threshold"
                  {...registerSettings("fallbackNightFreeDeliveryThreshold")}
                  inputMode="decimal"
                  placeholder="Пусто — ночью всегда платно"
                  aria-invalid={Boolean(
                    settingsErrors.fallbackNightFreeDeliveryThreshold,
                  )}
                />
                <FormFieldError
                  message={
                    settingsErrors.fallbackNightFreeDeliveryThreshold?.message
                  }
                />
              </label>
              <button
                className="primary-button delivery-settings-save"
                data-testid="delivery-settings-save"
                disabled={actions.updateSettings.isPending || !config.data}
              >
                {actions.updateSettings.isPending ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </form>
        </div>
      </details>
    </section>
  );
}
