import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  canAddProductImages,
  MAX_PRODUCT_IMAGES,
  useAdminCategories,
  useAdminProducts,
  type Category,
  type Product,
} from "@/src/entities/catalog";
import { useCatalogActions } from "@/src/features/catalog-management";
import { resolveApiUrl } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { AsyncPanel, DataTable } from "@/src/shared/ui";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export function CatalogManager() {
  const { session } = useSession();
  const categories = useAdminCategories();
  const products = useAdminProducts();
  const actions = useCatalogActions();
  const [categoryEdit, setCategoryEdit] = useState<Category | null>(null);
  const [productEdit, setProductEdit] = useState<Product | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [storedProductImages, setStoredProductImages] = useState<
    Product["images"]
  >([]);
  const [selectedProductFiles, setSelectedProductFiles] = useState<File[]>([]);
  const [productImageError, setProductImageError] = useState("");
  const canEdit = Boolean(
    session &&
      ["ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );

  const categoryColumns = useMemo<ColumnDef<Category, unknown>[]>(
    () => [
      {
        header: "Категория",
        cell: ({ row }) => (
          <div className="media-cell">
            {row.original.imageUrl ? (
              <img
                src={resolveApiUrl(row.original.imageUrl)}
                alt=""
                loading="lazy"
                width={48}
                height={48}
              />
            ) : (
              <span className="media-placeholder">◫</span>
            )}
            <div className="primary-cell">
              <strong>{row.original.name}</strong>
              <small>/{row.original.slug}</small>
            </div>
          </div>
        ),
      },
      {
        header: "Товаров",
        cell: ({ row }) => row.original.products.length,
      },
      { header: "Порядок", accessorKey: "sortOrder" },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Активна" : "Скрыта"}
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
                  setCategoryEdit(row.original);
                  setShowCategoryForm(true);
                }}
              >
                Изменить
              </button>
              <button
                className="text-button"
                disabled={actions.updateCategory.isPending}
                onClick={() =>
                  actions.updateCategory.mutate({
                    id: row.original.id,
                    body: {
                      sortOrder: row.original.sortOrder,
                      isActive: !row.original.isActive,
                    },
                  })
                }
              >
                {row.original.isActive ? "Скрыть" : "Включить"}
              </button>
            </div>
          ),
      },
    ],
    [actions.updateCategory, canEdit],
  );

  const productColumns = useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      {
        header: "Товар",
        cell: ({ row }) => (
          <div className="media-cell">
            {row.original.images.length ? (
              <div
                className="product-image-stack"
                aria-label={`Изображений: ${row.original.images.length}`}
              >
                {row.original.images.slice(0, 3).map((image) => (
                  <img
                    key={image.id}
                    src={resolveApiUrl(image.url)}
                    alt={image.alt ?? ""}
                    loading="lazy"
                    width={48}
                    height={48}
                  />
                ))}
                {row.original.images.length > 3 && (
                  <span>+{row.original.images.length - 3}</span>
                )}
              </div>
            ) : (
              <span className="media-placeholder">◫</span>
            )}
            <div className="primary-cell">
              <strong>{row.original.name}</strong>
              <small>{row.original.description}</small>
            </div>
          </div>
        ),
      },
      {
        header: "Категория",
        cell: ({ row }) => row.original.category?.name ?? "—",
      },
      {
        header: "Цена",
        cell: ({ row }) => `${Number(row.original.price).toFixed(2)} TMT`,
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "В продаже" : "Скрыт"}
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
                  setProductEdit(row.original);
                  setStoredProductImages(row.original.images);
                  setSelectedProductFiles([]);
                  setProductImageError("");
                  setShowProductForm(true);
                }}
              >
                Изменить
              </button>
              <button
                className="text-button"
                disabled={actions.updateProduct.isPending}
                onClick={() =>
                  actions.updateProduct.mutate({
                    id: row.original.id,
                    body: {
                      sortOrder: row.original.sortOrder,
                      isActive: !row.original.isActive,
                    },
                  })
                }
              >
                {row.original.isActive ? "Скрыть" : "Включить"}
              </button>
            </div>
          ),
      },
    ],
    [actions.updateProduct, canEdit],
  );

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("image");
    let imageUrl = categoryEdit?.imageUrl ?? undefined;
    if (file instanceof File && file.size) {
      imageUrl = (await actions.uploadImage.mutateAsync(file)).url;
    }
    const body = {
      name: String(form.get("name")).trim(),
      slug: String(form.get("slug")).trim(),
      sortOrder: Number(form.get("sortOrder")),
      isActive: form.get("isActive") === "on",
      ...(imageUrl ? { imageUrl } : {}),
    };
    if (categoryEdit) {
      await actions.updateCategory.mutateAsync({
        id: categoryEdit.id,
        body,
      });
    } else {
      await actions.createCategory.mutateAsync(body);
    }
    setCategoryEdit(null);
    setShowCategoryForm(false);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductImageError("");
    if (
      !canAddProductImages(
        storedProductImages.length,
        selectedProductFiles.length,
      )
    ) {
      setProductImageError(
        `У блюда может быть не больше ${MAX_PRODUCT_IMAGES} изображений.`,
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    const uploadedImages = selectedProductFiles.length
      ? await actions.uploadImages.mutateAsync(selectedProductFiles)
      : [];
    const imageUrls = [
      ...storedProductImages.map(({ url }) => url),
      ...uploadedImages.map(({ url }) => url),
    ];
    const body = {
      categoryId: String(form.get("categoryId")),
      name: String(form.get("name")).trim(),
      slug: String(form.get("slug")).trim(),
      description: String(form.get("description")).trim(),
      price: Number(form.get("price")),
      sortOrder: Number(form.get("sortOrder")),
      isActive: form.get("isActive") === "on",
      imageUrls,
    };
    if (productEdit) {
      await actions.updateProduct.mutateAsync({
        id: productEdit.id,
        body,
      });
    } else {
      await actions.createProduct.mutateAsync(body);
    }
    setProductEdit(null);
    setStoredProductImages([]);
    setSelectedProductFiles([]);
    setShowProductForm(false);
  }

  const mutationMessage =
    productImageError ||
    errorMessage(
      actions.uploadImage.error ||
        actions.uploadImages.error ||
        actions.createCategory.error ||
        actions.updateCategory.error ||
        actions.createProduct.error ||
        actions.updateProduct.error,
    );

  return (
    <section className="admin-section">
      <header className="section-head">
        <div>
          <span className="eyebrow">S3 + POSTGRESQL</span>
          <h1>Каталог кафе</h1>
          <p>Категории, блюда, описание, цена, доступность и WebP-изображения.</p>
        </div>
        {canEdit && (
          <div className="header-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setCategoryEdit(null);
                setShowCategoryForm((value) => !value);
              }}
            >
              + Категория
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setProductEdit(null);
                setStoredProductImages([]);
                setSelectedProductFiles([]);
                setProductImageError("");
                setShowProductForm((value) => !value);
              }}
            >
              + Блюдо
            </button>
          </div>
        )}
      </header>

      {mutationMessage && (
        <div className="inline-alert">{mutationMessage}</div>
      )}

      {showCategoryForm && (
        <form className="editor-card" onSubmit={submitCategory}>
          <div className="editor-title">
            <h2>{categoryEdit ? "Изменить категорию" : "Новая категория"}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowCategoryForm(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Название</span>
              <input
                name="name"
                defaultValue={categoryEdit?.name}
                onBlur={(event) => {
                  const slug = event.currentTarget.form?.elements.namedItem(
                    "slug",
                  );
                  if (slug instanceof HTMLInputElement && !slug.value) {
                    slug.value = slugify(event.currentTarget.value);
                  }
                }}
                required
                maxLength={100}
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                name="slug"
                defaultValue={categoryEdit?.slug}
                pattern="[a-z0-9-]+"
                required
              />
            </label>
            <label>
              <span>Порядок</span>
              <input
                name="sortOrder"
                type="number"
                defaultValue={categoryEdit?.sortOrder ?? 0}
              />
            </label>
            <label>
              <span>Изображение до 5 МБ</span>
              <input name="image" type="file" accept="image/*" />
            </label>
            <label className="check-field">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={categoryEdit?.isActive ?? true}
              />
              Активна
            </label>
          </div>
          <button
            className="primary-button"
            disabled={
              actions.uploadImage.isPending ||
              actions.createCategory.isPending ||
              actions.updateCategory.isPending
            }
          >
            Сохранить категорию
          </button>
        </form>
      )}

      {showProductForm && (
        <form className="editor-card" onSubmit={submitProduct}>
          <div className="editor-title">
            <h2>{productEdit ? "Изменить блюдо" : "Новое блюдо"}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setShowProductForm(false);
                setProductEdit(null);
                setStoredProductImages([]);
                setSelectedProductFiles([]);
                setProductImageError("");
              }}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Категория</span>
              <select
                name="categoryId"
                defaultValue={
                  productEdit?.categoryId ?? categories.data?.[0]?.id ?? ""
                }
                required
              >
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Название</span>
              <input
                name="name"
                defaultValue={productEdit?.name}
                onBlur={(event) => {
                  const slug = event.currentTarget.form?.elements.namedItem(
                    "slug",
                  );
                  if (slug instanceof HTMLInputElement && !slug.value) {
                    slug.value = slugify(event.currentTarget.value);
                  }
                }}
                required
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                name="slug"
                defaultValue={productEdit?.slug}
                pattern="[a-z0-9-]+"
                required
              />
            </label>
            <label>
              <span>Цена TMT</span>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={productEdit?.price}
                required
              />
            </label>
            <label>
              <span>Порядок</span>
              <input
                name="sortOrder"
                type="number"
                defaultValue={productEdit?.sortOrder ?? 0}
              />
            </label>
            <div className="wide-field product-image-editor">
              <div className="product-image-heading">
                <span>Изображения блюда</span>
                <small>
                  {storedProductImages.length + selectedProductFiles.length}/
                  {MAX_PRODUCT_IMAGES}. Первое изображение будет главным.
                </small>
              </div>
              {storedProductImages.length > 0 && (
                <div className="product-image-grid">
                  {storedProductImages.map((image, index) => (
                    <article className="product-image-card" key={image.id}>
                      <img
                        src={resolveApiUrl(image.url)}
                        alt={image.alt ?? ""}
                        loading="lazy"
                        width={160}
                        height={110}
                      />
                      <div>
                        <small>
                          {index === 0 ? "Главное" : `Фото ${index + 1}`}
                        </small>
                        <button
                          className="text-button"
                          type="button"
                          aria-label={`Убрать изображение ${index + 1}`}
                          onClick={() =>
                            setStoredProductImages((images) =>
                              images.filter(({ id }) => id !== image.id),
                            )
                          }
                        >
                          Убрать
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <label className="product-file-picker">
                <span>Добавить файлы до 5 МБ каждый</span>
                <input
                  name="images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    if (
                      !canAddProductImages(
                        storedProductImages.length,
                        files.length,
                      )
                    ) {
                      setSelectedProductFiles([]);
                      setProductImageError(
                        `Можно сохранить не больше ${MAX_PRODUCT_IMAGES} изображений.`,
                      );
                      event.currentTarget.value = "";
                      return;
                    }
                    setSelectedProductFiles(files);
                    setProductImageError("");
                  }}
                />
              </label>
              {selectedProductFiles.length > 0 && (
                <div className="selected-product-files" aria-live="polite">
                  {selectedProductFiles.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${file.lastModified}`}>
                      {storedProductImages.length === 0 && index === 0
                        ? "Главное: "
                        : ""}
                      {file.name}
                      <button
                        className="text-button"
                        type="button"
                        aria-label={`Убрать выбранный файл ${file.name}`}
                        onClick={() =>
                          setSelectedProductFiles((files) =>
                            files.filter((candidate) => candidate !== file),
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <label className="wide-field">
              <span>Описание</span>
              <textarea
                name="description"
                defaultValue={productEdit?.description}
                rows={3}
                required
                maxLength={4000}
              />
            </label>
            <label className="check-field">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={productEdit?.isActive ?? true}
              />
              В продаже
            </label>
          </div>
          <button
            className="primary-button"
            disabled={
              actions.uploadImages.isPending ||
              actions.createProduct.isPending ||
              actions.updateProduct.isPending
            }
          >
            Сохранить блюдо
          </button>
        </form>
      )}

      <div className="split-tables">
        <article className="table-card">
          <div className="card-title">
            <h2>Категории</h2>
            <span>{categories.data?.length ?? 0}</span>
          </div>
          <AsyncPanel
            pending={categories.isPending}
            error={categories.error}
            onRetry={() => void categories.refetch()}
          >
            <DataTable
              columns={categoryColumns}
              data={categories.data ?? []}
              getRowId={(category) => category.id}
              empty="Категорий пока нет"
            />
          </AsyncPanel>
        </article>
        <article className="table-card">
          <div className="card-title">
            <h2>Блюда</h2>
            <span>{products.data?.length ?? 0}</span>
          </div>
          <AsyncPanel
            pending={products.isPending}
            error={products.error}
            onRetry={() => void products.refetch()}
          >
            <DataTable
              columns={productColumns}
              data={products.data ?? []}
              getRowId={(product) => product.id}
              empty="Добавьте первое блюдо"
            />
          </AsyncPanel>
        </article>
      </div>
    </section>
  );
}
