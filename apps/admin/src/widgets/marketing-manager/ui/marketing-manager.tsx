import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import {
  useAdminBanners,
  useAdminPromos,
  type Banner,
  type Promo,
} from "@/src/entities/marketing";
import { useAdminCategories, useAdminProducts } from "@/src/entities/catalog";
import { useCatalogActions } from "@/src/features/catalog-management";
import { useMarketingActions } from "@/src/features/marketing-management";
import { resolveApiUrl } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { FormFieldError, toIsoDateTime } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  bannerFormSchema,
  promoFormSchema,
  type BannerFormInput,
  type BannerFormValues,
  type PromoFormInput,
  type PromoFormValues,
} from "../model/marketing-forms";

function parseBannerTarget(link: string | null) {
  const match = link?.match(/^app:\/\/(product|category)\/([^/]+)$/);
  return match
    ? { type: match[1] as "product" | "category", id: match[2] }
    : { type: "external" as const, id: "" };
}

export function MarketingManager() {
  const { session } = useSession();
  const banners = useAdminBanners();
  const promos = useAdminPromos();
  const marketing = useMarketingActions();
  const media = useCatalogActions();
  const categories = useAdminCategories();
  const products = useAdminProducts();
  const [bannerEdit, setBannerEdit] = useState<Banner | null>(null);
  const [promoEdit, setPromoEdit] = useState<Promo | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [bannerTargetType, setBannerTargetType] = useState<"external" | "product" | "category">("external");
  const [bannerTargetId, setBannerTargetId] = useState("");
  const {
    register: registerBanner,
    handleSubmit: handleBannerSubmit,
    reset: resetBanner,
    setError: setBannerError,
    formState: { errors: bannerErrors },
  } = useForm<BannerFormInput, unknown, BannerFormValues>({
    resolver: zodResolver(bannerFormSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      subtitle: "",
      link: "",
      sortOrder: 0,
      startsAt: "",
      endsAt: "",
      isActive: true,
      image: undefined,
    },
  });
  const {
    register: registerPromo,
    handleSubmit: handlePromoSubmit,
    reset: resetPromo,
    formState: { errors: promoErrors },
  } = useForm<PromoFormInput, unknown, PromoFormValues>({
    resolver: zodResolver(promoFormSchema),
    mode: "onBlur",
    defaultValues: {
      code: "",
      type: "PERCENT",
      value: 0,
      minOrderAmount: undefined,
      maxDiscountAmount: undefined,
      totalUsageLimit: undefined,
      perUserLimit: 1,
      startsAt: "",
      endsAt: "",
      isActive: true,
    },
  });
  const canEdit = Boolean(
    session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );

  const bannerColumns = useMemo<ColumnDef<Banner, unknown>[]>(
    () => [
      {
        header: "Баннер",
        cell: ({ row }) => (
          <div className="media-cell">
            <img
              src={resolveApiUrl(row.original.imageUrl)}
              alt=""
              loading="lazy"
              width={72}
              height={48}
            />
            <div className="primary-cell">
              <strong>{row.original.title}</strong>
              <small>{row.original.subtitle || "Без подзаголовка"}</small>
            </div>
          </div>
        ),
      },
      { header: "Порядок", accessorKey: "sortOrder" },
      {
        header: "Период",
        cell: ({ row }) => (
          <span className="muted">
            {row.original.startsAt
              ? new Date(row.original.startsAt).toLocaleDateString("ru-RU")
              : "сейчас"}{" "}
            —{" "}
            {row.original.endsAt
              ? new Date(row.original.endsAt).toLocaleDateString("ru-RU")
              : "без срока"}
          </span>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Показывается" : "Выключен"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canEdit && (
            <div className="row-actions">
              <button
                className="secondary-button compact"
                onClick={() => {
                  setBannerEdit(row.original);
                  const target = parseBannerTarget(row.original.link);
                  setBannerTargetType(target.type);
                  setBannerTargetId(target.id);
                  resetBanner({
                    title: row.original.title,
                    subtitle: row.original.subtitle ?? "",
                    link: row.original.link ?? "",
                    sortOrder: row.original.sortOrder,
                    startsAt: row.original.startsAt?.slice(0, 16) ?? "",
                    endsAt: row.original.endsAt?.slice(0, 16) ?? "",
                    isActive: row.original.isActive,
                    image: undefined,
                  });
                  setShowBanner(true);
                }}
              >
                Изменить
              </button>
              <button
                className="text-button"
                onClick={() =>
                  marketing.updateBanner.mutate({
                    id: row.original.id,
                    body: { isActive: !row.original.isActive },
                  })
                }
              >
                {row.original.isActive ? "Выключить" : "Включить"}
              </button>
            </div>
          ),
      },
    ],
    [canEdit, marketing.updateBanner, resetBanner],
  );

  const promoColumns = useMemo<ColumnDef<Promo, unknown>[]>(
    () => [
      {
        header: "Промокод",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong className="code-value">{row.original.code}</strong>
            <small>
              использован {row.original.usedCount}
              {row.original.totalUsageLimit
                ? ` / ${row.original.totalUsageLimit}`
                : " раз"}
            </small>
          </div>
        ),
      },
      {
        header: "Скидка",
        cell: ({ row }) =>
          row.original.type === "PERCENT"
            ? `${row.original.value}%`
            : `${row.original.value} TMT`,
      },
      {
        header: "Минимум",
        cell: ({ row }) =>
          row.original.minOrderAmount
            ? `${row.original.minOrderAmount} TMT`
            : "Нет",
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Активен" : "Выключен"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canEdit && (
            <div className="row-actions">
              <button
                className="secondary-button compact"
                onClick={() => {
                  setPromoEdit(row.original);
                  resetPromo({
                    code: row.original.code,
                    type: row.original.type,
                    value: Number(row.original.value),
                    minOrderAmount:
                      row.original.minOrderAmount === null
                        ? undefined
                        : Number(row.original.minOrderAmount),
                    maxDiscountAmount:
                      row.original.maxDiscountAmount === null
                        ? undefined
                        : Number(row.original.maxDiscountAmount),
                    totalUsageLimit: row.original.totalUsageLimit ?? undefined,
                    perUserLimit: row.original.perUserLimit,
                    startsAt: row.original.startsAt?.slice(0, 16) ?? "",
                    endsAt: row.original.endsAt?.slice(0, 16) ?? "",
                    isActive: row.original.isActive,
                  });
                  setShowPromo(true);
                }}
              >
                Изменить
              </button>
              <button
                className="text-button"
                onClick={() =>
                  marketing.updatePromo.mutate({
                    id: row.original.id,
                    body: {
                      perUserLimit: row.original.perUserLimit,
                      isActive: !row.original.isActive,
                    },
                  })
                }
              >
                {row.original.isActive ? "Выключить" : "Включить"}
              </button>
            </div>
          ),
      },
    ],
    [canEdit, marketing.updatePromo, resetPromo],
  );

  async function submitBanner(values: BannerFormValues) {
    const file = (values.image as FileList | undefined)?.item(0);
    let imageUrl = bannerEdit?.imageUrl;
    if (file?.size) {
      imageUrl = (await media.uploadImage.mutateAsync(file)).url;
    }
    if (!imageUrl) {
      setBannerError("image", { message: "Выберите изображение баннера" });
      return;
    }
    const body = {
      title: values.title,
      subtitle: values.subtitle,
      imageUrl,
      link: bannerTargetType === "external"
          ? values.link
          : bannerTargetId
          ? `app://${bannerTargetType}/${bannerTargetId}`
          : "",
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      startsAt: toIsoDateTime(values.startsAt),
      endsAt: toIsoDateTime(values.endsAt),
    };
    if (bannerEdit) {
      await marketing.updateBanner.mutateAsync({
        id: bannerEdit.id,
        body,
      });
    } else {
      await marketing.createBanner.mutateAsync(body);
    }
    setBannerEdit(null);
    setShowBanner(false);
    resetBanner();
  }

  async function submitPromo(values: PromoFormValues) {
    const body = {
      ...values,
      startsAt: toIsoDateTime(values.startsAt),
      endsAt: toIsoDateTime(values.endsAt),
    };
    if (promoEdit) {
      await marketing.updatePromo.mutateAsync({
        id: promoEdit.id,
        body,
      });
    } else {
      await marketing.createPromo.mutateAsync(body);
    }
    setPromoEdit(null);
    setShowPromo(false);
    resetPromo();
  }

  const mutationError =
    marketing.createBanner.error ||
    marketing.updateBanner.error ||
    marketing.createPromo.error ||
    marketing.updatePromo.error ||
    media.uploadImage.error;

  return (
    <section className="admin-section">
      <header className="section-head">
        <div>
          <span className="eyebrow">МАРКЕТИНГ</span>
          <h1>Баннеры и промокоды</h1>
          <p>Все изменения сохраняются в backend и сразу доступны клиентам.</p>
        </div>
        {canEdit && (
          <div className="header-actions">
            <button
              className="secondary-button"
              data-testid="banner-form-open"
              onClick={() => {
                setBannerEdit(null);
                setBannerTargetType("external");
                setBannerTargetId("");
                resetBanner();
                setShowBanner((value) => !value);
              }}
            >
              + Баннер
            </button>
            <button
              className="primary-button"
              data-testid="promo-form-open"
              onClick={() => {
                setPromoEdit(null);
                resetPromo();
                setShowPromo((value) => !value);
              }}
            >
              + Промокод
            </button>
          </div>
        )}
      </header>

      {mutationError && (
        <div className="inline-alert">
          {mutationError instanceof Error ? mutationError.message : ""}
        </div>
      )}

      {showBanner && (
        <form
          className="editor-card"
          data-testid="banner-form"
          noValidate
          onSubmit={handleBannerSubmit(submitBanner)}
        >
          <div className="editor-title">
            <h2>{bannerEdit ? "Изменить баннер" : "Новый баннер"}</h2>
            <button
              className="text-button"
              data-testid="banner-form-close"
              type="button"
              onClick={() => {
                setShowBanner(false);
                setBannerEdit(null);
                resetBanner();
              }}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Заголовок</span>
              <input
                data-testid="banner-title"
                {...registerBanner("title")}
                aria-invalid={Boolean(bannerErrors.title)}
                maxLength={160}
              />
              <FormFieldError message={bannerErrors.title?.message} />
            </label>
            <label>
              <span>Подзаголовок</span>
              <input
                data-testid="banner-subtitle"
                {...registerBanner("subtitle")}
                aria-invalid={Boolean(bannerErrors.subtitle)}
              />
              <FormFieldError message={bannerErrors.subtitle?.message} />
            </label>
            <label>
              <span>Переход</span>
              <select value={bannerTargetType} onChange={(event) => {
                setBannerTargetType(event.target.value as "external" | "product" | "category");
                setBannerTargetId("");
              }}>
                <option value="external">Внешняя ссылка</option>
                <option value="product">Открыть блюдо</option>
                <option value="category">Открыть категорию</option>
              </select>
            </label>
            {bannerTargetType === "external" ? <label>
              <span>Ссылка</span>
              <input
                data-testid="banner-link"
                {...registerBanner("link")}
                aria-invalid={Boolean(bannerErrors.link)}
              />
              <FormFieldError message={bannerErrors.link?.message} />
            </label> : <label className="wide-field">
              <span>{bannerTargetType === "product" ? "Блюдо" : "Категория"}</span>
              <select value={bannerTargetId} onChange={(event) => setBannerTargetId(event.target.value)}>
                <option value="">Выберите…</option>
                {bannerTargetType === "product"
                    ? (products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)
                    : (categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>}
            <label>
              <span>Порядок</span>
              <input
                data-testid="banner-sort-order"
                {...registerBanner("sortOrder", { valueAsNumber: true })}
                aria-invalid={Boolean(bannerErrors.sortOrder)}
                type="number"
              />
              <FormFieldError message={bannerErrors.sortOrder?.message} />
            </label>
            <label>
              <span>Начало</span>
              <input
                data-testid="banner-starts-at"
                {...registerBanner("startsAt")}
                aria-invalid={Boolean(bannerErrors.startsAt)}
                type="datetime-local"
              />
              <FormFieldError message={bannerErrors.startsAt?.message} />
            </label>
            <label>
              <span>Окончание</span>
              <input
                data-testid="banner-ends-at"
                {...registerBanner("endsAt")}
                aria-invalid={Boolean(bannerErrors.endsAt)}
                type="datetime-local"
              />
              <FormFieldError message={bannerErrors.endsAt?.message} />
            </label>
            <label>
              <span>Изображение до 5 МБ</span>
              <input
                data-testid="banner-image"
                {...registerBanner("image")}
                aria-invalid={Boolean(bannerErrors.image)}
                type="file"
                accept="image/*"
              />
              <FormFieldError message={bannerErrors.image?.message} />
            </label>
            <label className="check-field">
              <input
                data-testid="banner-active"
                {...registerBanner("isActive")}
                type="checkbox"
              />
              Показывать
            </label>
          </div>
          <button
            className="primary-button"
            data-testid="banner-save"
            disabled={
              media.uploadImage.isPending ||
              marketing.createBanner.isPending ||
              marketing.updateBanner.isPending
            }
          >
            Сохранить баннер
          </button>
        </form>
      )}

      {showPromo && (
        <form
          className="editor-card"
          data-testid="promo-form"
          noValidate
          onSubmit={handlePromoSubmit(submitPromo)}
        >
          <div className="editor-title">
            <h2>{promoEdit ? "Изменить промокод" : "Новый промокод"}</h2>
            <button
              className="text-button"
              data-testid="promo-form-close"
              type="button"
              onClick={() => {
                setShowPromo(false);
                setPromoEdit(null);
                resetPromo();
              }}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Код</span>
              <input
                data-testid="promo-code"
                {...registerPromo("code")}
                aria-invalid={Boolean(promoErrors.code)}
                maxLength={40}
              />
              <FormFieldError message={promoErrors.code?.message} />
            </label>
            <label>
              <span>Тип скидки</span>
              <select data-testid="promo-type" {...registerPromo("type")}>
                <option value="PERCENT">Процент</option>
                <option value="FIXED">Сумма TMT</option>
              </select>
              <FormFieldError message={promoErrors.type?.message} />
            </label>
            <label>
              <span>Значение</span>
              <input
                data-testid="promo-value"
                {...registerPromo("value", { valueAsNumber: true })}
                aria-invalid={Boolean(promoErrors.value)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError message={promoErrors.value?.message} />
            </label>
            <label>
              <span>Минимум заказа</span>
              <input
                data-testid="promo-min-order"
                {...registerPromo("minOrderAmount", {
                  setValueAs: (value) =>
                    value === "" ? undefined : Number(value),
                })}
                aria-invalid={Boolean(promoErrors.minOrderAmount)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError message={promoErrors.minOrderAmount?.message} />
            </label>
            <label>
              <span>Максимум скидки</span>
              <input
                data-testid="promo-max-discount"
                {...registerPromo("maxDiscountAmount", {
                  setValueAs: (value) =>
                    value === "" ? undefined : Number(value),
                })}
                aria-invalid={Boolean(promoErrors.maxDiscountAmount)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError
                message={promoErrors.maxDiscountAmount?.message}
              />
            </label>
            <label>
              <span>Общий лимит</span>
              <input
                data-testid="promo-total-limit"
                {...registerPromo("totalUsageLimit", {
                  setValueAs: (value) =>
                    value === "" ? undefined : Number(value),
                })}
                aria-invalid={Boolean(promoErrors.totalUsageLimit)}
                type="number"
                min="1"
              />
              <FormFieldError message={promoErrors.totalUsageLimit?.message} />
            </label>
            <label>
              <span>На пользователя</span>
              <input
                data-testid="promo-user-limit"
                {...registerPromo("perUserLimit", { valueAsNumber: true })}
                aria-invalid={Boolean(promoErrors.perUserLimit)}
                type="number"
                min="1"
              />
              <FormFieldError message={promoErrors.perUserLimit?.message} />
            </label>
            <label>
              <span>Начало</span>
              <input
                data-testid="promo-starts-at"
                {...registerPromo("startsAt")}
                aria-invalid={Boolean(promoErrors.startsAt)}
                type="datetime-local"
              />
              <FormFieldError message={promoErrors.startsAt?.message} />
            </label>
            <label>
              <span>Окончание</span>
              <input
                data-testid="promo-ends-at"
                {...registerPromo("endsAt")}
                aria-invalid={Boolean(promoErrors.endsAt)}
                type="datetime-local"
              />
              <FormFieldError message={promoErrors.endsAt?.message} />
            </label>
            <label className="check-field">
              <input
                data-testid="promo-active"
                {...registerPromo("isActive")}
                type="checkbox"
              />
              Активен
            </label>
          </div>
          <button
            className="primary-button"
            data-testid="promo-save"
            disabled={
              marketing.createPromo.isPending || marketing.updatePromo.isPending
            }
          >
            Сохранить промокод
          </button>
        </form>
      )}

      <div className="split-tables">
        <article className="table-card">
          <div className="card-title">
            <h2>Баннеры</h2>
            <span>{banners.data?.length ?? 0}</span>
          </div>
          <AsyncPanel
            pending={banners.isPending}
            error={banners.error}
            onRetry={() => void banners.refetch()}
          >
            <DataTable
              columns={bannerColumns}
              data={banners.data ?? []}
              getRowId={(banner) => banner.id}
              empty="Баннеров пока нет"
              label="Баннеры"
            />
          </AsyncPanel>
        </article>
        <article className="table-card">
          <div className="card-title">
            <h2>Промокоды</h2>
            <span>{promos.data?.length ?? 0}</span>
          </div>
          <AsyncPanel
            pending={promos.isPending}
            error={promos.error}
            onRetry={() => void promos.refetch()}
          >
            <DataTable
              columns={promoColumns}
              data={promos.data ?? []}
              getRowId={(promo) => promo.id}
              empty="Промокодов пока нет"
              label="Промокоды"
            />
          </AsyncPanel>
        </article>
      </div>
    </section>
  );
}
