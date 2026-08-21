import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  canAddProductImages,
  filterCatalogCategories,
  filterCatalogProducts,
  groupProductsByCategory,
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
  const [catalogSearch, setCatalogSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [expandedProductGroups, setExpandedProductGroups] = useState<
    Set<string> | "all" | null
  >(null);
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
    control: productControl,
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
      receiptPrinterIp: "",
      variantLabel: "",
      variants: [],
      sortOrder: 0,
      isActive: true,
    },
  });
  const {
    fields: productVariantFields,
    append: appendProductVariant,
    remove: removeProductVariant,
  } = useFieldArray({
    control: productControl,
    name: "variants",
    keyName: "formKey",
  });
  const watchedProductVariants =
    useWatch({ control: productControl, name: "variants" }) ?? [];
  const canEdit = Boolean(
    session &&
      ["ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );
  const hasSearch = Boolean(catalogSearch.trim());
  const filteredCategories = useMemo(
    () => filterCatalogCategories(categories.data ?? [], catalogSearch),
    [catalogSearch, categories.data],
  );
  const filteredProducts = useMemo(
    () =>
      filterCatalogProducts(products.data ?? [], {
        categoryId: productCategoryFilter,
        query: catalogSearch,
      }),
    [catalogSearch, productCategoryFilter, products.data],
  );
  const productGroups = useMemo(
    () => groupProductsByCategory(filteredProducts),
    [filteredProducts],
  );

  const expandedProductGroupCount =
    expandedProductGroups === "all"
      ? productGroups.length
      : expandedProductGroups === null
        ? Math.min(1, productGroups.length)
        : productGroups.filter(({ id }) => expandedProductGroups.has(id))
            .length;

  function toggleProductGroup(groupId: string) {
    setExpandedProductGroups((current) => {
      const next =
        current === "all"
          ? new Set(productGroups.map(({ id }) => id))
          : current === null
            ? new Set(productGroups[0] ? [productGroups[0].id] : [])
            : new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

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
        cell: ({ row }) => {
          const imageCount =
            row.original.images.length +
            row.original.variants.reduce(
              (sum, variant) => sum + variant.images.length,
              0,
            );
          return (
            <div className="media-cell">
              {row.original.displayImageUrl ? (
                <div
                  className="product-image-stack"
                  aria-label={`Изображений: ${imageCount}`}
                >
                  <img
                    src={resolveApiUrl(row.original.displayImageUrl)}
                    alt=""
                    loading="lazy"
                    width={48}
                    height={48}
                  />
                  {imageCount > 1 && <span>+{imageCount - 1}</span>}
                </div>
              ) : (
                <span className="media-placeholder">◫</span>
              )}
              <div className="primary-cell">
                <strong>{row.original.name}</strong>
                <small>{row.original.description}</small>
              </div>
            </div>
          );
        },
      },
      {
        header: "Цена",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>
              {row.original.hasVariants ? "от " : ""}
              {Number(row.original.minPrice).toFixed(2)} TMT
            </strong>
            {row.original.hasVariants && (
              <small>
                {row.original.variantLabel}: {row.original.variants.length}
              </small>
            )}
          </div>
        ),
      },
      {
        header: "Чековый аппарат",
        cell: ({ row }) => row.original.receiptPrinterIp ?? "Не назначен",
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
                    receiptPrinterIp: row.original.receiptPrinterIp ?? "",
                    variantLabel: row.original.variantLabel ?? "",
                    variants: row.original.variants.map((variant) => ({
                      id: variant.id,
                      name: variant.name,
                      description: variant.description ?? "",
                      price: Number(variant.price),
                      sortOrder: variant.sortOrder,
                      isActive: variant.isActive,
                      imageUrls: variant.images.map(({ url }) => url),
                      imageFiles: undefined,
                    })),
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
    for (const variant of values.variants) {
      const files = Array.from(
        (variant.imageFiles as FileList | undefined) ?? [],
      );
      if (!canAddProductImages(variant.imageUrls.length, files.length)) {
        setProductImageError(
          `У варианта «${variant.name}» может быть не больше ${MAX_PRODUCT_IMAGES} изображений.`,
        );
        return;
      }
    }
    const uploadedImages = selectedProductFiles.length
      ? await actions.uploadImages.mutateAsync(selectedProductFiles)
      : [];
    const imageUrls = [
      ...storedProductImages.map(({ url }) => url),
      ...uploadedImages.map(({ url }) => url),
    ];
    const variants = await Promise.all(
      values.variants.map(async ({ imageFiles, ...variant }) => {
        const files = Array.from((imageFiles as FileList | undefined) ?? []);
        const uploaded = files.length
          ? await actions.uploadImages.mutateAsync(files)
          : [];
        return {
          ...variant,
          description: variant.description || undefined,
          imageUrls: [
            ...variant.imageUrls,
            ...uploaded.map(({ url }) => url),
          ],
        };
      }),
    );
    const body = {
      categoryId: values.categoryId,
      name: values.name,
      slug: values.slug,
      description: values.description,
      price: values.price,
      receiptPrinterIp: values.receiptPrinterIp || null,
      variantLabel: values.variantLabel || undefined,
      variants,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
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
    <section className="admin-section" data-testid="catalog-manager">
      <header className="section-head" data-testid="catalog-header">
        <div>
          <span className="eyebrow">S3 + POSTGRESQL</span>
          <h1>Каталог кафе</h1>
          <p>Категории, блюда, описание, цена, доступность и WebP-изображения.</p>
        </div>
        {canEdit && (
          <div
            className="header-actions section-header-actions"
            data-testid="catalog-header-actions"
          >
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
                  receiptPrinterIp: "",
                  variantLabel: "",
                  variants: [],
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

      <section className="catalog-search-panel" aria-label="Поиск по каталогу">
        <div>
          <span className="eyebrow">БЫСТРЫЙ ПОИСК</span>
          <strong>Найдите блюдо или категорию</strong>
        </div>
        <label className="catalog-search-input">
          <span className="visually-hidden">Поиск</span>
          <span aria-hidden="true">⌕</span>
          <input
            value={catalogSearch}
            onChange={(event) => {
              setCatalogSearch(event.target.value);
              if (event.target.value.trim()) setExpandedProductGroups("all");
            }}
            placeholder="Название, slug или описание…"
          />
          {catalogSearch && (
            <button type="button" aria-label="Очистить поиск" onClick={() => setCatalogSearch("")}>×</button>
          )}
        </label>
        <label className="catalog-category-filter">
          <span>Категория</span>
          <select
            value={productCategoryFilter}
            onChange={(event) => {
              setProductCategoryFilter(event.target.value);
              if (event.target.value) setExpandedProductGroups("all");
            }}
          >
            <option value="">Все категории</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      </section>

      {showCategoryForm && (
        <div
          className="modal-backdrop catalog-editor-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setShowCategoryForm(false);
              setCategoryEdit(null);
              resetCategory();
            }
          }}
        >
          <form
            className="editor-card catalog-editor-modal catalog-category-modal"
            data-testid="category-form"
            noValidate
            onSubmit={handleCategorySubmit(submitCategory)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-editor-title"
          >
          <div className="editor-title catalog-editor-title">
            <div>
              <span className="eyebrow">КАТАЛОГ</span>
              <h2 id="category-editor-title">{categoryEdit ? "Изменить категорию" : "Новая категория"}</h2>
            </div>
            <button
              className="catalog-editor-close"
              data-testid="category-form-close"
              type="button"
              aria-label="Закрыть редактор категории"
              onClick={() => {
                setShowCategoryForm(false);
                setCategoryEdit(null);
                resetCategory();
              }}
            >
              ×
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
        </div>
      )}

      {showProductForm && (
        <div
          className="modal-backdrop catalog-editor-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setShowProductForm(false);
              setProductEdit(null);
              setStoredProductImages([]);
              setSelectedProductFiles([]);
              setProductImageError("");
              resetProduct();
            }
          }}
        >
          <form
            className="editor-card catalog-editor-modal"
            data-testid="product-form"
            noValidate
            onSubmit={handleProductSubmit(submitProduct)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-editor-title"
          >
          <div className="editor-title catalog-editor-title">
            <div>
              <span className="eyebrow">КАТАЛОГ</span>
              <h2 id="product-editor-title">{productEdit ? "Изменить блюдо" : "Новое блюдо"}</h2>
            </div>
            <button
              className="catalog-editor-close"
              data-testid="product-form-close"
              type="button"
              aria-label="Закрыть редактор блюда"
              onClick={() => {
                setShowProductForm(false);
                setProductEdit(null);
                setStoredProductImages([]);
                setSelectedProductFiles([]);
                setProductImageError("");
                resetProduct();
              }}
            >
              ×
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
              <span>Базовая цена TMT</span>
              <input
                data-testid="product-price"
                {...registerProduct("price", { valueAsNumber: true })}
                aria-invalid={Boolean(productErrors.price)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError message={productErrors.price?.message} />
              <small>
                Используется без вариантов. С вариантами цена блюда считается
                по самому дешёвому активному варианту.
              </small>
            </label>
            <label>
              <span>IP чекового аппарата</span>
              <input
                data-testid="product-receipt-printer-ip"
                {...registerProduct("receiptPrinterIp")}
                aria-invalid={Boolean(productErrors.receiptPrinterIp)}
                inputMode="decimal"
                placeholder="192.168.1.50"
              />
              <FormFieldError message={productErrors.receiptPrinterIp?.message} />
              <small>
                LAN-аппарат, на который должна отправляться эта позиция заказа.
              </small>
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
            <section
              className="wide-field product-variants-editor"
              data-testid="product-variants-editor"
            >
              <div className="product-variants-heading">
                <div>
                  <strong>Варианты блюда</strong>
                  <small>
                    Размер пиццы, способ нарезки или любой другой выбор с
                    отдельной ценой и фотографиями.
                  </small>
                </div>
                <button
                  className="secondary-button compact"
                  data-testid="product-variant-add"
                  type="button"
                  onClick={() =>
                    appendProductVariant({
                      name: "",
                      description: "",
                      price: getProductValues("price") || 0,
                      sortOrder: productVariantFields.length,
                      isActive: true,
                      imageUrls: [],
                      imageFiles: undefined,
                    })
                  }
                >
                  + Добавить вариант
                </button>
              </div>
              {productVariantFields.length > 0 && (
                <label className="product-variant-label-field">
                  <span>Название выбора для клиента</span>
                  <input
                    data-testid="product-variant-label"
                    {...registerProduct("variantLabel")}
                    aria-invalid={Boolean(productErrors.variantLabel)}
                    placeholder="Например: Размер или Способ нарезки"
                    maxLength={80}
                  />
                  <FormFieldError message={productErrors.variantLabel?.message} />
                </label>
              )}
              <div className="product-variant-list">
                {productVariantFields.map((field, index) => {
                  const variant = watchedProductVariants[index];
                  const storedUrls = variant?.imageUrls ?? [];
                  const selectedFiles = Array.from(
                    (variant?.imageFiles as FileList | undefined) ?? [],
                  );
                  const variantError = productErrors.variants?.[index];
                  const variantTestId = variant?.id ?? field.formKey;
                  return (
                    <article
                      className="product-variant-card"
                      data-testid={`product-variant-card-${variantTestId}`}
                      key={field.formKey}
                    >
                      <header>
                        <strong>Вариант {index + 1}</strong>
                        <button
                          className="text-button danger"
                          data-testid={`product-variant-toggle-${variantTestId}`}
                          type="button"
                          onClick={() => {
                            if (variant?.id) {
                              setProductValue(
                                `variants.${index}.isActive`,
                                !variant.isActive,
                                { shouldDirty: true },
                              );
                            } else {
                              removeProductVariant(index);
                            }
                          }}
                        >
                          {variant?.id
                            ? variant.isActive
                              ? "Убрать из продажи"
                              : "Вернуть в продажу"
                            : "Удалить"}
                        </button>
                      </header>
                      <div className="product-variant-fields">
                        <label>
                          <span>Название</span>
                          <input
                            data-testid={`product-variant-name-${variantTestId}`}
                            {...registerProduct(`variants.${index}.name`)}
                            aria-invalid={Boolean(variantError?.name)}
                            placeholder="Маленькая, 25 см"
                            maxLength={120}
                          />
                          <FormFieldError message={variantError?.name?.message} />
                        </label>
                        <label>
                          <span>Цена TMT</span>
                          <input
                            data-testid={`product-variant-price-${variantTestId}`}
                            {...registerProduct(`variants.${index}.price`, { valueAsNumber: true })}
                            aria-invalid={Boolean(variantError?.price)}
                            type="number"
                            min="0"
                            step="0.01"
                          />
                          <FormFieldError message={variantError?.price?.message} />
                        </label>
                        <label>
                          <span>Порядок</span>
                          <input
                            data-testid={`product-variant-sort-${variantTestId}`}
                            {...registerProduct(`variants.${index}.sortOrder`, { valueAsNumber: true })}
                            aria-invalid={Boolean(variantError?.sortOrder)}
                            type="number"
                          />
                          <FormFieldError message={variantError?.sortOrder?.message} />
                        </label>
                        <label className="check-field">
                          <input
                            data-testid={`product-variant-active-${variantTestId}`}
                            {...registerProduct(`variants.${index}.isActive`)}
                            type="checkbox"
                          />
                          В продаже
                        </label>
                        <label className="wide-field">
                          <span>Описание варианта (необязательно)</span>
                          <input
                            data-testid={`product-variant-description-${variantTestId}`}
                            {...registerProduct(`variants.${index}.description`)}
                            aria-invalid={Boolean(variantError?.description)}
                            maxLength={300}
                          />
                          <FormFieldError message={variantError?.description?.message} />
                        </label>
                      </div>
                      {storedUrls.length > 0 && (
                        <div className="product-variant-images">
                          {storedUrls.map((url, imageIndex) => (
                            <div key={`${url}-${imageIndex}`}>
                              <img src={resolveApiUrl(url)} alt="" loading="lazy" width={88} height={64} />
                              <button
                                className="text-button"
                                data-testid={`product-variant-image-remove-${variantTestId}-${imageIndex}`}
                                type="button"
                                aria-label={`Убрать фото варианта ${imageIndex + 1}`}
                                onClick={() =>
                                  setProductValue(
                                    `variants.${index}.imageUrls`,
                                    storedUrls.filter((_, candidateIndex) => candidateIndex !== imageIndex),
                                    { shouldDirty: true },
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="product-file-picker">
                        <span>
                          Фото варианта: {storedUrls.length + selectedFiles.length}/{MAX_PRODUCT_IMAGES}
                        </span>
                        <input
                          data-testid={`product-variant-images-${variantTestId}`}
                          {...registerProduct(`variants.${index}.imageFiles`)}
                          type="file"
                          accept="image/*"
                          multiple
                        />
                      </label>
                      {selectedFiles.length > 0 && (
                        <small className="product-variant-file-names">
                          Будут добавлены: {selectedFiles.map(({ name }) => name).join(", ")}
                        </small>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
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
        </div>
      )}

      <div className="split-tables">
        <article className="table-card">
          <div className="card-title">
            <h2>Категории</h2>
            <span>{filteredCategories.length}{hasSearch ? ` / ${categories.data?.length ?? 0}` : ""}</span>
          </div>
          <AsyncPanel
            pending={categories.isPending}
            error={categories.error}
            onRetry={() => void categories.refetch()}
          >
            <DataTable
              columns={categoryColumns}
              data={filteredCategories}
              getRowId={(category) => category.id}
              empty="Категорий пока нет"
              label="Категории каталога"
            />
          </AsyncPanel>
        </article>
        <article className="table-card catalog-products-table">
          <div className="card-title">
            <div>
              <h2>Блюда по категориям</h2>
              <small>{productGroups.length} групп</small>
            </div>
            <div className="catalog-accordion-actions">
              <span>{filteredProducts.length}{(hasSearch || productCategoryFilter) ? ` / ${products.data?.length ?? 0}` : ""}</span>
              <button
                className="text-button compact"
                data-testid="catalog-product-groups-collapse"
                disabled={!expandedProductGroupCount}
                type="button"
                onClick={() => setExpandedProductGroups(new Set())}
              >
                Свернуть все
              </button>
              <button
                className="text-button compact"
                data-testid="catalog-product-groups-expand"
                disabled={
                  !productGroups.length ||
                  expandedProductGroupCount === productGroups.length
                }
                type="button"
                onClick={() => setExpandedProductGroups("all")}
              >
                Раскрыть все
              </button>
            </div>
          </div>
          <AsyncPanel
            pending={products.isPending}
            error={products.error}
            onRetry={() => void products.refetch()}
          >
            {productGroups.length ? (
              <div
                className="catalog-product-groups"
                data-testid="catalog-product-groups"
              >
                {productGroups.map((group, groupIndex) => {
                  const isExpanded =
                    expandedProductGroups === "all" ||
                    (expandedProductGroups === null
                      ? groupIndex === 0
                      : expandedProductGroups.has(group.id));
                  const panelId = `catalog-product-group-panel-${group.id}`;
                  return (
                    <section
                      className="catalog-product-group"
                      data-testid={`catalog-product-group-${group.id}`}
                      key={group.id}
                    >
                      <header className="catalog-product-group-head">
                        <button
                          aria-controls={panelId}
                          aria-expanded={isExpanded}
                          className="catalog-product-group-toggle"
                          data-testid={`catalog-product-group-toggle-${group.id}`}
                          type="button"
                          onClick={() => toggleProductGroup(group.id)}
                        >
                          <span className="catalog-product-group-title">
                            <strong>{group.name}</strong>
                            {!group.isActive && <small>Категория скрыта</small>}
                          </span>
                          <span className="catalog-product-group-meta">
                            <span>{group.products.length}</span>
                            <span aria-hidden="true" className="catalog-product-group-chevron">
                              ⌄
                            </span>
                          </span>
                        </button>
                      </header>
                      {isExpanded && (
                        <div
                          data-testid={`catalog-product-group-panel-${group.id}`}
                          id={panelId}
                        >
                          <DataTable
                            columns={productColumns}
                            data={group.products}
                            getRowId={(product) => product.id}
                            label={`Блюда категории ${group.name}`}
                          />
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="async-state">Подходящих блюд нет</div>
            )}
          </AsyncPanel>
        </article>
      </div>
    </section>
  );
}
