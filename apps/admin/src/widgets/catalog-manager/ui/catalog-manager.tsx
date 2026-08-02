import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
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
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  categoryFormSchema,
  productFormSchema,
  slugify,
  type CategoryFormValues,
  type ProductFormValues,
} from "../model/catalog-forms";

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
  const {
    register: registerCategory,
    handleSubmit: handleCategorySubmit,
    reset: resetCategory,
    getValues: getCategoryValues,
    setValue: setCategoryValue,
    formState: { errors: categoryErrors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      slug: "",
      sortOrder: 0,
      isActive: true,
      image: undefined,
    },
  });
  const {
    register: registerProduct,
    handleSubmit: handleProductSubmit,
    reset: resetProduct,
    getValues: getProductValues,
    setValue: setProductValue,
    formState: { errors: productErrors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    mode: "onBlur",
    defaultValues: {
      categoryId: "",
      name: "",
      slug: "",
      description: "",
      price: 0,
      sortOrder: 0,
      isActive: true,
    },
  });
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
                  resetCategory({
                    name: row.original.name,
                    slug: row.original.slug,
                    sortOrder: row.original.sortOrder,
                    isActive: row.original.isActive,
                    image: undefined,
                  });
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
    [actions.updateCategory, canEdit, resetCategory],
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
                  resetProduct({
                    categoryId: row.original.categoryId,
                    name: row.original.name,
                    slug: row.original.slug,
                    description: row.original.description,
                    price: Number(row.original.price),
                    sortOrder: row.original.sortOrder,
                    isActive: row.original.isActive,
                  });
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
    [actions.updateProduct, canEdit, resetProduct],
  );

  async function submitCategory(values: CategoryFormValues) {
    const file = (values.image as FileList | undefined)?.item(0);
    let imageUrl = categoryEdit?.imageUrl ?? undefined;
    if (file?.size) {
      imageUrl = (await actions.uploadImage.mutateAsync(file)).url;
    }
    const body = {
      name: values.name,
      slug: values.slug,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
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
    resetCategory();
  }

  async function submitProduct(values: ProductFormValues) {
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
    const uploadedImages = selectedProductFiles.length
      ? await actions.uploadImages.mutateAsync(selectedProductFiles)
      : [];
    const imageUrls = [
      ...storedProductImages.map(({ url }) => url),
      ...uploadedImages.map(({ url }) => url),
    ];
    const body = {
      ...values,
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
    resetProduct();
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
              data-testid="catalog-category-open"
              onClick={() => {
                setCategoryEdit(null);
                resetCategory({
                  name: "",
                  slug: "",
                  sortOrder: 0,
                  isActive: true,
                  image: undefined,
                });
                setShowCategoryForm((value) => !value);
              }}
            >
              + Категория
            </button>
            <button
              className="primary-button"
              data-testid="catalog-product-open"
              onClick={() => {
                setProductEdit(null);
                setStoredProductImages([]);
                setSelectedProductFiles([]);
                setProductImageError("");
                resetProduct({
                  categoryId: categories.data?.[0]?.id ?? "",
                  name: "",
                  slug: "",
                  description: "",
                  price: 0,
                  sortOrder: 0,
                  isActive: true,
                });
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
        <form
          className="editor-card"
          data-testid="category-form"
          noValidate
          onSubmit={handleCategorySubmit(submitCategory)}
        >
          <div className="editor-title">
            <h2>{categoryEdit ? "Изменить категорию" : "Новая категория"}</h2>
            <button
              className="text-button"
              data-testid="category-form-close"
              type="button"
              onClick={() => {
                setShowCategoryForm(false);
                setCategoryEdit(null);
                resetCategory();
              }}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Название</span>
              <input
                data-testid="category-name"
                {...registerCategory("name", {
                  onBlur(event) {
                    if (!getCategoryValues("slug")) {
                      setCategoryValue("slug", slugify(event.target.value), {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  },
                })}
                aria-invalid={Boolean(categoryErrors.name)}
                maxLength={100}
              />
              <FormFieldError message={categoryErrors.name?.message} />
            </label>
            <label>
              <span>Slug</span>
              <input
                data-testid="category-slug"
                {...registerCategory("slug")}
                aria-invalid={Boolean(categoryErrors.slug)}
              />
              <FormFieldError message={categoryErrors.slug?.message} />
            </label>
            <label>
              <span>Порядок</span>
              <input
                data-testid="category-sort-order"
                {...registerCategory("sortOrder", { valueAsNumber: true })}
                aria-invalid={Boolean(categoryErrors.sortOrder)}
                type="number"
              />
              <FormFieldError message={categoryErrors.sortOrder?.message} />
            </label>
            <label>
              <span>Изображение до 5 МБ</span>
              <input
                data-testid="category-image"
                {...registerCategory("image")}
                type="file"
                accept="image/*"
              />
            </label>
            <label className="check-field">
              <input
                data-testid="category-active"
                {...registerCategory("isActive")}
                type="checkbox"
              />
              Активна
            </label>
          </div>
          <button
            className="primary-button"
            data-testid="category-save"
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
        <form
          className="editor-card"
          data-testid="product-form"
          noValidate
          onSubmit={handleProductSubmit(submitProduct)}
        >
          <div className="editor-title">
            <h2>{productEdit ? "Изменить блюдо" : "Новое блюдо"}</h2>
            <button
              className="text-button"
              data-testid="product-form-close"
              type="button"
              onClick={() => {
                setShowProductForm(false);
                setProductEdit(null);
                setStoredProductImages([]);
                setSelectedProductFiles([]);
                setProductImageError("");
                resetProduct();
              }}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Категория</span>
              <select
                data-testid="product-category"
                {...registerProduct("categoryId")}
                aria-invalid={Boolean(productErrors.categoryId)}
              >
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <FormFieldError message={productErrors.categoryId?.message} />
            </label>
            <label>
              <span>Название</span>
              <input
                data-testid="product-name"
                {...registerProduct("name", {
                  onBlur(event) {
                    if (!getProductValues("slug")) {
                      setProductValue("slug", slugify(event.target.value), {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  },
                })}
                aria-invalid={Boolean(productErrors.name)}
              />
              <FormFieldError message={productErrors.name?.message} />
            </label>
            <label>
              <span>Slug</span>
              <input
                data-testid="product-slug"
                {...registerProduct("slug")}
                aria-invalid={Boolean(productErrors.slug)}
              />
              <FormFieldError message={productErrors.slug?.message} />
            </label>
            <label>
              <span>Цена TMT</span>
              <input
                data-testid="product-price"
                {...registerProduct("price", { valueAsNumber: true })}
                aria-invalid={Boolean(productErrors.price)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError message={productErrors.price?.message} />
            </label>
            <label>
              <span>Порядок</span>
              <input
                data-testid="product-sort-order"
                {...registerProduct("sortOrder", { valueAsNumber: true })}
                aria-invalid={Boolean(productErrors.sortOrder)}
                type="number"
              />
              <FormFieldError message={productErrors.sortOrder?.message} />
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
                  data-testid="product-images"
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
                data-testid="product-description"
                {...registerProduct("description")}
                aria-invalid={Boolean(productErrors.description)}
                rows={3}
                maxLength={4000}
              />
              <FormFieldError message={productErrors.description?.message} />
            </label>
            <label className="check-field">
              <input
                data-testid="product-active"
                {...registerProduct("isActive")}
                type="checkbox"
              />
              В продаже
            </label>
          </div>
          <button
            className="primary-button"
            data-testid="product-save"
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
              label="Категории каталога"
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
              label="Блюда каталога"
            />
          </AsyncPanel>
        </article>
      </div>
    </section>
  );
}
