import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  useAdminBanners,
  useAdminPromos,
  type Banner,
  type Promo,
} from "@/src/entities/marketing";
import { useCatalogActions } from "@/src/features/catalog-management";
import { useMarketingActions } from "@/src/features/marketing-management";
import { resolveApiUrl } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { AsyncPanel, DataTable } from "@/src/shared/ui";

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : undefined;
}

export function MarketingManager() {
  const { session } = useSession();
  const banners = useAdminBanners();
  const promos = useAdminPromos();
  const marketing = useMarketingActions();
  const media = useCatalogActions();
  const [bannerEdit, setBannerEdit] = useState<Banner | null>(null);
  const [promoEdit, setPromoEdit] = useState<Promo | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
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
    [canEdit, marketing.updateBanner],
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
    [canEdit, marketing.updatePromo],
  );

  async function submitBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("image");
    let imageUrl = bannerEdit?.imageUrl;
    if (file instanceof File && file.size) {
      imageUrl = (await media.uploadImage.mutateAsync(file)).url;
    }
    if (!imageUrl) throw new Error("Выберите изображение баннера");
    const startsAt = String(form.get("startsAt") ?? "");
    const endsAt = String(form.get("endsAt") ?? "");
    const body = {
      title: String(form.get("title")).trim(),
      subtitle: String(form.get("subtitle") ?? "").trim() || undefined,
      imageUrl,
      link: String(form.get("link") ?? "").trim() || undefined,
      sortOrder: Number(form.get("sortOrder")),
      isActive: form.get("isActive") === "on",
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
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
  }

  async function submitPromo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get("startsAt") ?? "");
    const endsAt = String(form.get("endsAt") ?? "");
    const body = {
      code: String(form.get("code")).trim().toUpperCase(),
      type: String(form.get("type")) as "PERCENT" | "FIXED",
      value: Number(form.get("value")),
      minOrderAmount: optionalNumber(form.get("minOrderAmount")),
      maxDiscountAmount: optionalNumber(form.get("maxDiscountAmount")),
      totalUsageLimit: optionalNumber(form.get("totalUsageLimit")),
      perUserLimit: Number(form.get("perUserLimit")),
      isActive: form.get("isActive") === "on",
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
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
              onClick={() => {
                setBannerEdit(null);
                setShowBanner((value) => !value);
              }}
            >
              + Баннер
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setPromoEdit(null);
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
        <form className="editor-card" onSubmit={submitBanner}>
          <div className="editor-title">
            <h2>{bannerEdit ? "Изменить баннер" : "Новый баннер"}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowBanner(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Заголовок</span>
              <input
                name="title"
                defaultValue={bannerEdit?.title}
                required
                maxLength={160}
              />
            </label>
            <label>
              <span>Подзаголовок</span>
              <input
                name="subtitle"
                defaultValue={bannerEdit?.subtitle ?? ""}
              />
            </label>
            <label>
              <span>Ссылка</span>
              <input name="link" defaultValue={bannerEdit?.link ?? ""} />
            </label>
            <label>
              <span>Порядок</span>
              <input
                name="sortOrder"
                type="number"
                defaultValue={bannerEdit?.sortOrder ?? 0}
              />
            </label>
            <label>
              <span>Начало</span>
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={bannerEdit?.startsAt?.slice(0, 16)}
              />
            </label>
            <label>
              <span>Окончание</span>
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={bannerEdit?.endsAt?.slice(0, 16)}
              />
            </label>
            <label>
              <span>Изображение до 5 МБ</span>
              <input
                name="image"
                type="file"
                accept="image/*"
                required={!bannerEdit}
              />
            </label>
            <label className="check-field">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={bannerEdit?.isActive ?? true}
              />
              Показывать
            </label>
          </div>
          <button className="primary-button">Сохранить баннер</button>
        </form>
      )}

      {showPromo && (
        <form className="editor-card" onSubmit={submitPromo}>
          <div className="editor-title">
            <h2>{promoEdit ? "Изменить промокод" : "Новый промокод"}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowPromo(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Код</span>
              <input
                name="code"
                defaultValue={promoEdit?.code}
                required
                maxLength={40}
              />
            </label>
            <label>
              <span>Тип скидки</span>
              <select name="type" defaultValue={promoEdit?.type ?? "PERCENT"}>
                <option value="PERCENT">Процент</option>
                <option value="FIXED">Сумма TMT</option>
              </select>
            </label>
            <label>
              <span>Значение</span>
              <input
                name="value"
                type="number"
                min="0"
                step="0.01"
                defaultValue={promoEdit?.value}
                required
              />
            </label>
            <label>
              <span>Минимум заказа</span>
              <input
                name="minOrderAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={promoEdit?.minOrderAmount ?? ""}
              />
            </label>
            <label>
              <span>Максимум скидки</span>
              <input
                name="maxDiscountAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={promoEdit?.maxDiscountAmount ?? ""}
              />
            </label>
            <label>
              <span>Общий лимит</span>
              <input
                name="totalUsageLimit"
                type="number"
                min="1"
                defaultValue={promoEdit?.totalUsageLimit ?? ""}
              />
            </label>
            <label>
              <span>На пользователя</span>
              <input
                name="perUserLimit"
                type="number"
                min="1"
                defaultValue={promoEdit?.perUserLimit ?? 1}
                required
              />
            </label>
            <label>
              <span>Начало</span>
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={promoEdit?.startsAt?.slice(0, 16)}
              />
            </label>
            <label>
              <span>Окончание</span>
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={promoEdit?.endsAt?.slice(0, 16)}
              />
            </label>
            <label className="check-field">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={promoEdit?.isActive ?? true}
              />
              Активен
            </label>
          </div>
          <button className="primary-button">Сохранить промокод</button>
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
            />
          </AsyncPanel>
        </article>
      </div>
    </section>
  );
}
