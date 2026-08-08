import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useAdminProducts } from "@/src/entities/catalog";
import {
  useAssistedCustomerSearch,
  type AssistedCustomer,
  type AssistedCustomerAddress,
} from "@/src/entities/customer";
import {
  useGeocodeSearch,
  useReverseGeocode,
  type GeocodeSearchResult,
} from "@/src/entities/geocoding";
import { type Order } from "@/src/entities/order";
import {
  type CreateAssistedOrderBody,
  useAssistedOrderActions,
} from "@/src/features/assisted-order";
import { ApiError } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import {
  assistedOrderFormSchema,
  type AssistedOrderCoordinates,
  type AssistedOrderFormInput,
  type AssistedOrderFormValues,
} from "../model/assisted-order-form";
import {
  findExactAssistedCustomer,
  getPreferredAssistedAddress,
  toSavedAddressSelection,
} from "../model/assisted-customer-selection";

const AssistedOrderMapPicker = lazy(
  () => import("./assisted-order-map-picker"),
);

function customerName(customer: AssistedCustomer) {
  return (
    [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
    "Без имени"
  );
}

function mutationMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    return "Данные клиента или заказа изменились. Проверьте выбор и повторите.";
  }
  return error instanceof Error ? error.message : "Не удалось создать заказ";
}

export default function AssistedOrderDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const products = useAdminProducts();
  const actions = useAssistedOrderActions();
  const [submittedCustomerPhone, setSubmittedCustomerPhone] = useState("");
  const [submittedAddressQuery, setSubmittedAddressQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<AssistedCustomer | null>(null);
  const [coordinates, setCoordinates] =
    useState<AssistedOrderCoordinates | null>(null);
  const [quantityByProduct, setQuantityByProduct] = useState<
    Record<string, number>
  >({});
  const [productSearch, setProductSearch] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [customerSearchError, setCustomerSearchError] = useState("");
  const [addressSearchError, setAddressSearchError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const customers = useAssistedCustomerSearch();
  const addressResults = useGeocodeSearch(submittedAddressQuery);
  const reverse = useReverseGeocode(
    coordinates?.latitude ?? null,
    coordinates?.longitude ?? null,
  );
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AssistedOrderFormInput, unknown, AssistedOrderFormValues>({
    resolver: zodResolver(assistedOrderFormSchema),
    mode: "onBlur",
    defaultValues: {
      customerPhone: "+993",
      customerFirstName: "",
      customerLastName: "",
      addressId: "",
      addressLabel: "По телефону",
      address: "",
      entrance: "",
      floor: "",
      apartment: "",
      customerNote: "",
      promoCode: "",
      addressSearch: "",
    },
  });
  const selectedAddressId = useWatch({ control, name: "addressId" });
  const customerPhoneField = register("customerPhone");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("ru-RU");
    return (products.data ?? []).filter(
      (product) =>
        product.isActive &&
        product.category?.isActive !== false &&
        (!query ||
          product.name.toLocaleLowerCase("ru-RU").includes(query) ||
          product.category?.name.toLocaleLowerCase("ru-RU").includes(query)),
    );
  }, [productSearch, products.data]);

  const selectedItems = useMemo(
    () =>
      (products.data ?? []).flatMap((product) => {
        const quantity = quantityByProduct[product.id] ?? 0;
        return quantity > 0 ? [{ product, quantity }] : [];
      }),
    [products.data, quantityByProduct],
  );
  const estimatedSubtotal = selectedItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  function changeQuantity(productId: string, delta: number) {
    setQuantityByProduct((current) => {
      const next = Math.max(0, Math.min(50, (current[productId] ?? 0) + delta));
      if (next === 0) {
        const nextQuantities = { ...current };
        delete nextQuantities[productId];
        return nextQuantities;
      }
      return { ...current, [productId]: next };
    });
    setSelectionError("");
  }

  const clearSelectedAddress = useCallback(() => {
    setValue("addressId", "");
    setValue("addressLabel", "По телефону");
    setValue("address", "");
    setValue("entrance", "");
    setValue("floor", "");
    setValue("apartment", "");
    setCoordinates(null);
  }, [setValue]);

  const selectAddress = useCallback((address: AssistedCustomerAddress) => {
    const selection = toSavedAddressSelection(address);
    setValue("addressId", selection.values.addressId, { shouldValidate: true });
    setValue("addressLabel", selection.values.addressLabel);
    setValue("address", selection.values.address, { shouldValidate: true });
    setValue("entrance", selection.values.entrance);
    setValue("floor", selection.values.floor);
    setValue("apartment", selection.values.apartment);
    setCoordinates(selection.coordinates);
    setSelectionError("");
  }, [setValue]);

  const selectCustomer = useCallback((customer: AssistedCustomer) => {
    setSelectedCustomer(customer);
    setValue("customerPhone", customer.phone, { shouldValidate: true });
    setValue("customerFirstName", customer.firstName ?? "");
    setValue("customerLastName", customer.lastName ?? "");
    const preferredAddress = getPreferredAssistedAddress(customer);
    if (preferredAddress) selectAddress(preferredAddress);
    else clearSelectedAddress();
  }, [clearSelectedAddress, selectAddress, setValue]);

  function selectSearchResult(result: GeocodeSearchResult) {
    setValue("addressId", "", { shouldValidate: true });
    setValue("address", result.label, { shouldValidate: true });
    setCoordinates({
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setSelectionError("");
  }

  async function findCustomer() {
    const phone = getValues("customerPhone").trim();
    if (phone.replace(/\D/g, "").length < 4) {
      setCustomerSearchError("Введите хотя бы 4 цифры номера");
      return;
    }
    setCustomerSearchError("");
    customers.reset();
    setSelectedCustomer(null);
    clearSelectedAddress();
    setSubmittedCustomerPhone(phone);
    try {
      const result = await customers.mutateAsync(phone);
      const exactCustomer = findExactAssistedCustomer(result.items, phone);
      if (exactCustomer) selectCustomer(exactCustomer);
    } catch {
      // TanStack Query owns the normalized search error rendered below.
    }
  }

  function editCustomerPhone(event: ChangeEvent<HTMLInputElement>) {
    void customerPhoneField.onChange(event);
    if (!selectedCustomer && !submittedCustomerPhone) return;
    setSelectedCustomer(null);
    setSubmittedCustomerPhone("");
    customers.reset();
    clearSelectedAddress();
  }

  function findAddress() {
    const query = getValues("addressSearch").trim();
    if (query.length < 3) {
      setAddressSearchError("Введите минимум 3 символа и нажмите «Найти»");
      return;
    }
    setAddressSearchError("");
    setSubmittedAddressQuery(query);
  }

  function selectMapCoordinates(next: AssistedOrderCoordinates) {
    setValue("addressId", "", { shouldValidate: true });
    setCoordinates(next);
    setSelectionError("");
  }

  async function submit(values: AssistedOrderFormValues) {
    if (!selectedItems.length) {
      setSelectionError("Добавьте хотя бы одно блюдо");
      return;
    }
    if (!values.addressId && !coordinates) {
      setSelectionError("Поставьте маркер адреса доставки на карте");
      return;
    }

    const body = {
      customerPhone: values.customerPhone,
      customerFirstName: values.customerFirstName,
      customerLastName: values.customerLastName,
      items: selectedItems.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
      })),
      ...(values.addressId
        ? { addressId: values.addressId }
        : {
            addressLabel: values.addressLabel,
            address: values.address,
            latitude: coordinates?.latitude,
            longitude: coordinates?.longitude,
            entrance: values.entrance,
            floor: values.floor,
            apartment: values.apartment,
          }),
      customerNote: values.customerNote,
      promoCode: values.promoCode,
    } satisfies CreateAssistedOrderBody;

    try {
      const created = await actions.create.mutateAsync(body);
      setCreatedOrder(created);
    } catch {
      // TanStack Query owns the normalized mutation error rendered below.
    }
  }

  function startAnotherOrder() {
    actions.create.reset();
    setCreatedOrder(null);
    setSelectedCustomer(null);
    setSubmittedCustomerPhone("");
    setSubmittedAddressQuery("");
    setCoordinates(null);
    setQuantityByProduct({});
    setProductSearch("");
    setSelectionError("");
    reset();
  }

  if (createdOrder) {
    return (
      <div className="modal-backdrop assisted-order-backdrop">
        <section
          aria-labelledby="assisted-order-success-title"
          aria-modal="true"
          className="modal assisted-order-modal assisted-order-success"
          role="dialog"
        >
          <span className="success-mark" aria-hidden="true">
            ✓
          </span>
          <h2 id="assisted-order-success-title">
            Заказ #{createdOrder.number} создан
          </h2>
          <p>
            Ближайший филиал: <strong>{createdOrder.branchName}</strong>. Сумма:{" "}
            <strong>{createdOrder.total.toFixed(2)} TMT</strong> наличными.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              data-testid="assisted-order-success-close"
              type="button"
              onClick={onClose}
            >
              Закрыть
            </button>
            <button
              className="primary-button"
              data-testid="assisted-order-success-another"
              type="button"
              onClick={startAnotherOrder}
            >
              Ещё заказ
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop assisted-order-backdrop">
      <form
        aria-labelledby="assisted-order-title"
        aria-modal="true"
        className="modal assisted-order-modal"
        data-testid="assisted-order-form"
        noValidate
        onSubmit={handleSubmit(submit)}
        role="dialog"
      >
        <header className="modal-head assisted-order-head">
          <div>
            <span className="eyebrow">ЗАКАЗ ПО ЗВОНКУ</span>
            <h2 id="assisted-order-title">Создать заказ за клиента</h2>
            <p>
              Наличная оплата. Backend сам выберет ближайший активный филиал.
            </p>
          </div>
          <button
            aria-label="Закрыть"
            data-testid="assisted-order-close"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="assisted-order-layout">
          <div className="assisted-order-column">
            <section className="assisted-order-card">
              <div className="assisted-order-section-title">
                <div>
                  <span>1</span>
                  <strong>Клиент</strong>
                </div>
                {selectedCustomer && (
                  <small>{customerName(selectedCustomer)}</small>
                )}
              </div>
              <div className="assisted-customer-search">
                <label>
                  <span>Телефон</span>
                  <input
                    data-testid="assisted-order-phone"
                    {...customerPhoneField}
                    aria-invalid={Boolean(errors.customerPhone)}
                    onChange={editCustomerPhone}
                    type="tel"
                    placeholder="+99365123456"
                  />
                  <FormFieldError message={errors.customerPhone?.message} />
                </label>
                <button
                  className="secondary-button"
                  data-testid="assisted-customer-search"
                  type="button"
                  onClick={findCustomer}
                >
                  Найти клиента
                </button>
              </div>
              {customerSearchError && (
                <p className="form-error">{customerSearchError}</p>
              )}
              {customers.isPending && <p className="muted">Ищем по номеру…</p>}
              {customers.isError && (
                <p className="form-error">{customers.error.message}</p>
              )}
              {customers.data && !customers.data.items.length && (
                <p className="assisted-order-hint">
                  Клиент не найден. Он будет безопасно создан при оформлении без
                  выдачи сессии или OTP.
                </p>
              )}
              {customers.data && customers.data.items.length > 0 && (
                <div
                  className="assisted-search-results"
                  data-testid="assisted-customer-results"
                >
                  {customers.data.items.map((customer) => (
                    <button
                      className={
                        selectedCustomer?.id === customer.id ? "selected" : ""
                      }
                      data-testid={`assisted-customer-result-${customer.id}`}
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                    >
                      <strong>{customerName(customer)}</strong>
                      <small>
                        {customer.phone} · адресов: {customer.addresses.length}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomer?.addresses.length ? (
                <p
                  className="assisted-order-hint"
                  data-testid="assisted-saved-address-hint"
                >
                  Клиент найден. Активный или последний использованный адрес
                  подставлен автоматически; ниже можно выбрать другой.
                </p>
              ) : null}
              <div className="modal-grid assisted-name-grid">
                <label>
                  <span>Имя (необязательно)</span>
                  <input
                    data-testid="assisted-order-first-name"
                    {...register("customerFirstName")}
                    maxLength={80}
                  />
                  <FormFieldError message={errors.customerFirstName?.message} />
                </label>
                <label>
                  <span>Фамилия (необязательно)</span>
                  <input
                    data-testid="assisted-order-last-name"
                    {...register("customerLastName")}
                    maxLength={80}
                  />
                  <FormFieldError message={errors.customerLastName?.message} />
                </label>
              </div>
              {selectedCustomer?.addresses.length ? (
                <label>
                  <span>Сохранённый адрес</span>
                  <select
                    data-testid="assisted-saved-address"
                    value={selectedAddressId ?? ""}
                    onChange={(event) => {
                      const address = selectedCustomer.addresses.find(
                        (item) => item.id === event.target.value,
                      );
                      if (address) selectAddress(address);
                      else clearSelectedAddress();
                    }}
                  >
                    <option value="">Новый адрес через карту</option>
                    {selectedCustomer.addresses.map((address) => (
                      <option value={address.id} key={address.id}>
                        {address.isActive ? "Активный · " : ""}
                        {address.label ? `${address.label} · ` : ""}
                        {address.address}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>

            <section className="assisted-order-card assisted-products-card">
              <div className="assisted-order-section-title">
                <div>
                  <span>2</span>
                  <strong>Блюда</strong>
                </div>
                <small>
                  {selectedItems.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                  шт.
                </small>
              </div>
              <input
                aria-label="Поиск блюда"
                className="assisted-product-search"
                data-testid="assisted-product-search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Найти блюдо или категорию"
                type="search"
              />
              {products.isPending && <p className="muted">Загружаем меню…</p>}
              {products.isError && (
                <p className="form-error">{products.error.message}</p>
              )}
              <div className="assisted-product-list">
                {visibleProducts.map((product) => {
                  const quantity = quantityByProduct[product.id] ?? 0;
                  return (
                    <article
                      className={quantity ? "selected" : ""}
                      key={product.id}
                    >
                      {product.images[0] ? (
                        <img
                          alt={product.images[0].alt ?? product.name}
                          height="52"
                          loading="lazy"
                          src={product.images[0].url}
                          width="52"
                        />
                      ) : (
                        <span
                          className="product-image-placeholder"
                          aria-hidden="true"
                        >
                          🍽
                        </span>
                      )}
                      <div>
                        <strong>{product.name}</strong>
                        <small>
                          {product.category?.name ?? "Без категории"}
                        </small>
                        <b>{product.price.toFixed(2)} TMT</b>
                      </div>
                      <div
                        className="quantity-stepper"
                        aria-label={`Количество ${product.name}`}
                      >
                        <button
                          data-testid={`assisted-product-minus-${product.id}`}
                          type="button"
                          onClick={() => changeQuantity(product.id, -1)}
                        >
                          −
                        </button>
                        <output>{quantity}</output>
                        <button
                          data-testid={`assisted-product-plus-${product.id}`}
                          type="button"
                          onClick={() => changeQuantity(product.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!products.isPending && !visibleProducts.length && (
                <p className="assisted-order-hint">
                  Подходящих активных блюд нет.
                </p>
              )}
              <div className="assisted-order-total">
                <span>Предварительно без скидки</span>
                <strong>{estimatedSubtotal.toFixed(2)} TMT</strong>
              </div>
            </section>
          </div>

          <div className="assisted-order-column">
            <section className="assisted-order-card assisted-address-card">
              <div className="assisted-order-section-title">
                <div>
                  <span>3</span>
                  <strong>Адрес доставки</strong>
                </div>
                {coordinates && (
                  <small>
                    {coordinates.latitude.toFixed(5)},{" "}
                    {coordinates.longitude.toFixed(5)}
                  </small>
                )}
              </div>
              <p className="assisted-order-hint">
                Ищите официальное название кнопкой или укажите неофициальный
                ориентир вручную. Точная точка всегда определяется маркером.
              </p>
              <div className="assisted-address-search">
                <label>
                  <span>Поиск места или улицы</span>
                  <input
                    data-testid="assisted-address-search-input"
                    {...register("addressSearch")}
                    placeholder="Например: Парахат 7, школа 26"
                  />
                  <FormFieldError message={errors.addressSearch?.message} />
                </label>
                <button
                  className="secondary-button"
                  data-testid="assisted-address-search-submit"
                  type="button"
                  onClick={findAddress}
                >
                  Найти
                </button>
              </div>
              {addressSearchError && (
                <p className="form-error">{addressSearchError}</p>
              )}
              {addressResults.isFetching && (
                <p className="muted">Ищем на карте…</p>
              )}
              {addressResults.isError && (
                <p className="form-error">{addressResults.error.message}</p>
              )}
              {addressResults.data && (
                <div className="assisted-search-results assisted-address-results">
                  {addressResults.data.items.map((result) => (
                    <button
                      data-testid={`assisted-address-result-${result.provider}-${result.latitude}-${result.longitude}`}
                      key={`${result.provider}:${result.latitude}:${result.longitude}`}
                      type="button"
                      onClick={() => selectSearchResult(result)}
                    >
                      <strong>{result.label}</strong>
                      {result.aliases.length > 0 && (
                        <small>
                          Также: {result.aliases.slice(0, 3).join(" · ")}
                        </small>
                      )}
                    </button>
                  ))}
                  {!addressResults.data.items.length && (
                    <p className="assisted-order-hint">
                      Совпадений нет — введите ориентир вручную и поставьте
                      маркер.
                    </p>
                  )}
                  <small className="map-attribution">
                    {addressResults.data.attribution}
                  </small>
                </div>
              )}
              <label>
                <span>Адрес / неофициальный ориентир</span>
                <textarea
                  data-testid="assisted-order-address"
                  {...register("address")}
                  aria-invalid={Boolean(errors.address)}
                  maxLength={500}
                  placeholder="Как объяснил клиент: дом, магазин, школа, поворот…"
                />
                <FormFieldError message={errors.address?.message} />
              </label>
              {reverse.data?.line && !selectedAddressId && (
                <button
                  className="reverse-address-button"
                  data-testid="assisted-address-use-reverse"
                  type="button"
                  onClick={() =>
                    setValue("address", reverse.data.line ?? "", {
                      shouldValidate: true,
                    })
                  }
                >
                  Подставить адрес точки: {reverse.data.line}
                </button>
              )}
              <Suspense
                fallback={
                  <div className="assisted-map-loading">Загружаем карту…</div>
                }
              >
                <AssistedOrderMapPicker
                  coordinates={coordinates}
                  onChange={selectMapCoordinates}
                />
              </Suspense>
              <div className="modal-grid assisted-address-details">
                <label>
                  <span>Метка</span>
                  <input
                    data-testid="assisted-address-label"
                    {...register("addressLabel")}
                    placeholder="Дом / офис"
                  />
                </label>
                <label>
                  <span>Подъезд</span>
                  <input
                    data-testid="assisted-address-entrance"
                    {...register("entrance")}
                  />
                </label>
                <label>
                  <span>Этаж</span>
                  <input
                    data-testid="assisted-address-floor"
                    {...register("floor")}
                  />
                </label>
                <label>
                  <span>Квартира</span>
                  <input
                    data-testid="assisted-address-apartment"
                    {...register("apartment")}
                  />
                </label>
              </div>
            </section>

            <section className="assisted-order-card assisted-order-extra">
              <div className="modal-grid">
                <label>
                  <span>Промокод</span>
                  <input
                    data-testid="assisted-order-promo"
                    {...register("promoCode")}
                    maxLength={40}
                  />
                  <FormFieldError message={errors.promoCode?.message} />
                </label>
                <label>
                  <span>Комментарий для доставки</span>
                  <textarea
                    data-testid="assisted-order-note"
                    {...register("customerNote")}
                    maxLength={500}
                  />
                  <FormFieldError message={errors.customerNote?.message} />
                </label>
              </div>
            </section>
          </div>
        </div>

        {(selectionError || actions.create.error) && (
          <div className="inline-alert" role="alert">
            {selectionError || mutationMessage(actions.create.error)}
          </div>
        )}
        <footer className="modal-actions assisted-order-actions">
          <div>
            <small>Итог и скидку проверяет backend</small>
            <strong>{estimatedSubtotal.toFixed(2)} TMT + доставка</strong>
          </div>
          <button
            className="secondary-button"
            data-testid="assisted-order-cancel"
            type="button"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            className="primary-button"
            data-testid="assisted-order-submit"
            disabled={actions.create.isPending}
            type="submit"
          >
            {actions.create.isPending ? "Создаём…" : "Создать заказ"}
          </button>
        </footer>
      </form>
    </div>
  );
}
