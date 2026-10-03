import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  filterOrderableProducts,
  groupProductsByCategory,
  useAdminProducts,
  type Product,
} from "@/src/entities/catalog";
import {
  useAssistedCustomerSearch,
  type AssistedCustomer,
  type AssistedCustomerAddress,
} from "@/src/entities/customer";
import {
  flattenDeliveryEtraps,
  useDeliveryConfig,
  useDeliveryQuote,
  useDeliveryTariffQuote,
} from "@/src/entities/delivery";
import {
  useGeocodeSearch,
  type GeocodeSearchResult,
} from "@/src/entities/geocoding";
import { type Order } from "@/src/entities/order";
import {
  type CreateAssistedOrderBody,
  useAssistedOrderActions,
  useAssistedOrderHistory,
} from "@/src/features/assisted-order";
import { ApiError, resolveApiUrl } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import {
  assistedOrderFormSchema,
  buildAssistedDeliveryAddress,
  type AssistedOrderCoordinates,
  type AssistedOrderFormInput,
  type AssistedOrderFormValues,
} from "../model/assisted-order-form";
import { buildAssistedOrderDeliverySelection } from "../model/assisted-order-delivery";
import {
  findExactAssistedCustomer,
  getPreferredAssistedAddress,
  toSavedAddressSelection,
} from "../model/assisted-customer-selection";
import { repeatPreviousOrder } from "../model/repeat-previous-order";

const AssistedOrderMapPicker = lazy(
  () => import("./assisted-order-map-picker"),
);

const ADDRESS_SEARCH_DEBOUNCE_MS = 350;

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

function activeVariants(product: Product) {
  return product.variants
    .filter(({ isActive }) => isActive)
    .sort(
      (left, right) =>
        left.price - right.price ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name),
    );
}

function selectionKey(productId: string, variantId?: string) {
  return `${productId}:${variantId ?? "base"}`;
}

type SelectedProductItem = {
  product: Product;
  variant: Product["variants"][number] | null;
  quantity: number;
};

type OrderStep = "menu" | "delivery" | "review";
type AddressMode = "manual" | "map";

export default function AssistedOrderDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const products = useAdminProducts();
  const deliveryConfig = useDeliveryConfig();
  const actions = useAssistedOrderActions();
  const [submittedCustomerPhone, setSubmittedCustomerPhone] = useState("");
  const [submittedAddressQuery, setSubmittedAddressQuery] = useState("");
  const [isAddressEditing, setIsAddressEditing] = useState(false);
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const [activeAddressResultIndex, setActiveAddressResultIndex] = useState(0);
  const [selectedAddressResult, setSelectedAddressResult] =
    useState<GeocodeSearchResult | null>(null);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<AssistedCustomer | null>(null);
  const [coordinates, setCoordinates] =
    useState<AssistedOrderCoordinates | null>(null);
  const [quantityBySelection, setQuantityBySelection] = useState<
    Record<string, number>
  >({});
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState<
    Record<string, string>
  >({});
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [repeatNotice, setRepeatNotice] = useState("");
  const [addressMode, setAddressMode] = useState<AddressMode>("manual");
  const [showMap, setShowMap] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState("");
  const [addressSearchError, setAddressSearchError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [step, setStep] = useState<OrderStep>("menu");
  const addressComboboxRef = useRef<HTMLDivElement>(null);
  const extraDetailsRef = useRef<HTMLDetailsElement>(null);
  const phoneLookupTimer = useRef<number | null>(null);
  const phoneLookupSequence = useRef(0);
  const customers = useAssistedCustomerSearch();
  const history = useAssistedOrderHistory(
    selectedCustomer?.id ?? null,
    selectedCustomer?.phone ?? "",
  );
  const addressResults = useGeocodeSearch(submittedAddressQuery);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    getFieldState,
    setValue,
    setFocus,
    trigger,
    reset,
    formState: { errors, isDirty },
  } = useForm<AssistedOrderFormInput, unknown, AssistedOrderFormValues>({
    resolver: zodResolver(assistedOrderFormSchema),
    mode: "onBlur",
    defaultValues: {
      customerPhone: "+993",
      customerFirstName: "",
      customerLastName: "",
      addressId: "",
      deliveryEtrapId: "",
      addressLabel: "По телефону",
      address: "",
      entrance: "",
      floor: "",
      apartment: "",
      customerNote: "",
      promoCode: "",
      addressSearch: "",
      deliveryPriceMode: "AUTO",
      manualDeliveryFee: "",
      manualDeliveryReason: "",
    },
  });
  const selectedAddressId = useWatch({ control, name: "addressId" });
  const selectedDeliveryEtrapId = useWatch({
    control,
    name: "deliveryEtrapId",
  });
  const addressSearchValue = useWatch({ control, name: "addressSearch" });
  const deliveryPriceMode = useWatch({ control, name: "deliveryPriceMode" });
  const manualDeliveryFeeValue = useWatch({ control, name: "manualDeliveryFee" });
  const customerPhoneField = register("customerPhone");
  const addressSearchField = register("addressSearch");
  const deliveryAddressField = register("address");

  const hasDraft =
    isDirty || Object.values(quantityBySelection).some((quantity) => quantity > 0);

  function requestClose() {
    if (
      !hasDraft ||
      window.confirm("Заказ ещё не создан. Закрыть и потерять введённые данные?")
    ) {
      onClose();
    }
  }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isAddressDropdownOpen) {
        setIsAddressDropdownOpen(false);
        return;
      }
      if (
        !hasDraft ||
        window.confirm("Заказ ещё не создан. Закрыть и потерять введённые данные?")
      ) {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [hasDraft, isAddressDropdownOpen, onClose]);

  useEffect(
    () => () => {
      if (phoneLookupTimer.current !== null)
        window.clearTimeout(phoneLookupTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (step === "delivery") setFocus("customerPhone");
  }, [setFocus, step]);

  useEffect(() => {
    function closeAddressDropdown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !addressComboboxRef.current?.contains(event.target)
      ) {
        setIsAddressDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeAddressDropdown);
    return () =>
      document.removeEventListener("pointerdown", closeAddressDropdown);
  }, []);

  useEffect(() => {
    if (!isAddressEditing) return;
    const query = addressSearchValue.trim();
    if (query.length < 3) return;

    const timeout = window.setTimeout(() => {
      setAddressSearchError("");
      setActiveAddressResultIndex(0);
      setSubmittedAddressQuery(query);
      setIsAddressDropdownOpen(true);
    }, ADDRESS_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [addressSearchValue, isAddressEditing]);

  const visibleProducts = useMemo(() => {
    return filterOrderableProducts(products.data ?? [], {
      categoryId: productCategoryFilter,
      query: productSearch,
    });
  }, [productCategoryFilter, productSearch, products.data]);
  const activeProductGroups = useMemo(
    () => groupProductsByCategory(filterOrderableProducts(products.data ?? [])),
    [products.data],
  );
  const visibleProductGroups = useMemo(
    () => groupProductsByCategory(visibleProducts),
    [visibleProducts],
  );

  const selectedItems = useMemo<SelectedProductItem[]>(() => {
    const items: SelectedProductItem[] = [];
    for (const product of products.data ?? []) {
      const variants = activeVariants(product);
      if (product.pricingType === "FIXED") {
        const quantity = quantityBySelection[selectionKey(product.id)] ?? 0;
        if (quantity > 0) items.push({ product, variant: null, quantity });
        continue;
      }
      for (const variant of variants) {
        const quantity =
          quantityBySelection[selectionKey(product.id, variant.id)] ?? 0;
        if (quantity > 0) items.push({ product, variant, quantity });
      }
    }
    return items;
  }, [products.data, quantityBySelection]);

  function goToDelivery() {
    setSelectionError("");
    setStep("delivery");
  }

  async function goToReview() {
    if (!selectedItems.length) {
      setSelectionError("Добавьте хотя бы одно блюдо");
      setStep("menu");
      return;
    }
    const valid = await trigger();
    if (!valid) {
      if (getFieldState("promoCode").invalid || getFieldState("customerNote").invalid) {
        extraDetailsRef.current?.setAttribute("open", "");
      }
      return;
    }
    if (addressMode === "map" && !coordinates) {
      setSelectionError("Поставьте точку на карте или выберите ввод адреса текстом");
      return;
    }
    if (!getValues("addressId") && !coordinates && !getValues("address")?.trim()) {
      setSelectionError("Введите адрес доставки или укажите точку на карте");
      return;
    }
    setSelectionError("");
    setStep("review");
  }
  const estimatedSubtotal = selectedItems.reduce(
    (sum, item) =>
      sum + (item.variant?.price ?? item.product.price) * item.quantity,
    0,
  );
  const distancePricingEnabled =
    deliveryConfig.data?.distancePricingEnabled ?? false;
  const useCoordinateQuote =
    step !== "menu" && addressMode === "map" && Boolean(coordinates) && (!selectedAddressId || distancePricingEnabled);
  const deliveryQuote = useDeliveryQuote(
    coordinates?.latitude ?? null,
    coordinates?.longitude ?? null,
    estimatedSubtotal,
    useCoordinateQuote,
  );
  const deliveryEtraps = useMemo(
    () => flattenDeliveryEtraps(deliveryConfig.data),
    [deliveryConfig.data],
  );
  const selectedDeliveryEtrap = deliveryEtraps.find(
    (etrap) => etrap.id === Number(selectedDeliveryEtrapId),
  );
  const selectedSavedAddress = selectedCustomer?.addresses.find(
    (address) => address.id === selectedAddressId,
  );
  const suggestedDeliveryEtrap = deliveryQuote.data?.etrap ?? null;
  const savedAddressQuote = useDeliveryTariffQuote(
    selectedSavedAddress?.deliveryEtrapId ??
      (selectedDeliveryEtrapId ? Number(selectedDeliveryEtrapId) : null),
    estimatedSubtotal,
    step !== "menu" && !distancePricingEnabled && Boolean(selectedSavedAddress || !coordinates),
  );
  const activeDeliveryQuote =
    useCoordinateQuote ? deliveryQuote : savedAddressQuote;
  const estimatedDeliveryFee = activeDeliveryQuote.data?.fee ?? null;
  const manualDeliveryFee = deliveryPriceMode === "MANUAL" && /^\d+(?:[.,]\d{1,2})?$/.test(manualDeliveryFeeValue.trim())
    ? Number(manualDeliveryFeeValue.replace(",", "."))
    : null;
  const displayedDeliveryFee = deliveryPriceMode === "MANUAL" ? manualDeliveryFee : estimatedDeliveryFee;
  const estimatedTotal =
    displayedDeliveryFee === null
      ? null
      : estimatedSubtotal + displayedDeliveryFee;

  useEffect(() => {
    if (
      addressMode !== "map" ||
      !coordinates ||
      selectedAddressId ||
      selectedDeliveryEtrapId ||
      !suggestedDeliveryEtrap
    ) {
      return;
    }
    setValue("deliveryEtrapId", String(suggestedDeliveryEtrap.id), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [
    addressMode,
    coordinates,
    selectedAddressId,
    selectedDeliveryEtrapId,
    setValue,
    suggestedDeliveryEtrap,
  ]);

  function changeQuantity(
    productId: string,
    variantId: string | undefined,
    delta: number,
  ) {
    const key = selectionKey(productId, variantId);
    setQuantityBySelection((current) => {
      const next = Math.max(0, Math.min(50, (current[key] ?? 0) + delta));
      if (next === 0) {
        const nextQuantities = { ...current };
        delete nextQuantities[key];
        return nextQuantities;
      }
      return { ...current, [key]: next };
    });
    setSelectionError("");
  }

  const clearSelectedAddress = useCallback(() => {
    setValue("addressId", "");
    setValue("deliveryEtrapId", "");
    setValue("addressLabel", "По телефону");
    setValue("address", "");
    setValue("entrance", "");
    setValue("floor", "");
    setValue("apartment", "");
    setCoordinates(null);
    setSelectedAddressResult(null);
    setSelectedLocationLabel("");
    setIsAddressEditing(false);
    setAddressMode("manual");
    setShowMap(false);
  }, [setValue]);

  function useManualAddress() {
    if (addressMode === "manual") return;
    const typedAddress = getValues("address").trim();
    const mappedAddress = selectedSavedAddress?.address || selectedLocationLabel;
    const manualAddress = mappedAddress
      ? typedAddress && typedAddress !== mappedAddress
        ? `${mappedAddress} — ${typedAddress}`
        : mappedAddress
      : typedAddress;
    setValue("addressId", "", { shouldDirty: true, shouldValidate: true });
    setValue("deliveryEtrapId", "", { shouldDirty: true, shouldValidate: true });
    setValue("address", manualAddress, { shouldDirty: true, shouldValidate: true });
    setValue("addressSearch", "");
    setCoordinates(null);
    setSelectedAddressResult(null);
    setSelectedLocationLabel("");
    setSubmittedAddressQuery("");
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setAddressSearchError("");
    setAddressMode("manual");
    setShowMap(false);
    setSelectionError("");
  }

  function useMapAddress() {
    setAddressMode("map");
    setShowMap(true);
    setSelectionError("");
  }

  const selectAddress = useCallback(
    (address: AssistedCustomerAddress) => {
      const selection = toSavedAddressSelection(address);
      setValue("addressId", selection.values.addressId, {
        shouldValidate: true,
      });
      setValue("deliveryEtrapId", selection.values.deliveryEtrapId, {
        shouldValidate: true,
      });
      setValue("addressLabel", selection.values.addressLabel);
      setValue("address", "", { shouldValidate: true });
      setValue("entrance", selection.values.entrance);
      setValue("floor", selection.values.floor);
      setValue("apartment", selection.values.apartment);
      setCoordinates(selection.coordinates);
      setSelectedAddressResult(null);
      setSelectedLocationLabel(address.address);
      setIsAddressEditing(false);
      setIsAddressDropdownOpen(false);
      setAddressMode(selection.coordinates ? "map" : "manual");
      setShowMap(false);
      setSelectionError("");
    },
    [setValue],
  );

  const selectCustomer = useCallback(
    (customer: AssistedCustomer, preserveAddress = false) => {
      setSelectedCustomer(customer);
      setValue("customerPhone", customer.phone, { shouldValidate: true });
      setValue("customerFirstName", customer.firstName ?? "");
      setValue("customerLastName", customer.lastName ?? "");
      if (preserveAddress) return;
      const preferredAddress = getPreferredAssistedAddress(customer);
      if (preferredAddress) selectAddress(preferredAddress);
      else clearSelectedAddress();
    },
    [clearSelectedAddress, selectAddress, setValue],
  );

  function selectSearchResult(result: GeocodeSearchResult) {
    setValue("addressId", "", { shouldValidate: true });
    setValue("deliveryEtrapId", "", { shouldValidate: true });
    setValue("addressSearch", result.label, { shouldValidate: true });
    setSelectedAddressResult(result);
    setSelectedLocationLabel(result.label);
    setCoordinates({
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setAddressMode("map");
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setShowMap(true);
    setSelectionError("");
  }

  async function findCustomerForPhone(phoneValue: string) {
    const phone = phoneValue.trim();
    if (phone.replace(/\D/g, "").length < 4) {
      setCustomerSearchError("Введите хотя бы 4 цифры номера");
      return;
    }
    const sequence = ++phoneLookupSequence.current;
    setCustomerSearchError("");
    customers.reset();
    setSelectedCustomer(null);
    setSubmittedCustomerPhone(phone);
    try {
      const result = await customers.mutateAsync(phone);
      if (sequence !== phoneLookupSequence.current) return;
      const exactCustomer = findExactAssistedCustomer(result.items, phone);
      if (exactCustomer)
        selectCustomer(exactCustomer, Boolean(getValues("address")?.trim() || coordinates));
    } catch {
      // TanStack Query owns the normalized search error rendered below.
    }
  }

  function findCustomer() {
    if (phoneLookupTimer.current !== null)
      window.clearTimeout(phoneLookupTimer.current);
    void findCustomerForPhone(getValues("customerPhone"));
  }

  function editCustomerPhone(event: ChangeEvent<HTMLInputElement>) {
    void customerPhoneField.onChange(event);
    phoneLookupSequence.current += 1;
    if (phoneLookupTimer.current !== null)
      window.clearTimeout(phoneLookupTimer.current);
    if (selectedCustomer || submittedCustomerPhone) {
      setSelectedCustomer(null);
      setSubmittedCustomerPhone("");
      customers.reset();
      clearSelectedAddress();
    }
    const nextPhone = event.target.value;
    const digits = nextPhone.replace(/\D/g, "");
    if (digits.startsWith("993") && digits.length === 11) {
      phoneLookupTimer.current = window.setTimeout(() => {
        void findCustomerForPhone(nextPhone);
      }, 350);
    }
  }

  function findAddress() {
    const query = getValues("addressSearch").trim();
    if (query.length < 3) {
      setAddressSearchError("Введите минимум 3 символа");
      return;
    }
    setIsAddressEditing(true);
    setShowMap(true);
    setAddressSearchError("");
    setActiveAddressResultIndex(0);
    setIsAddressDropdownOpen(true);
    if (query === submittedAddressQuery) {
      void addressResults.refetch();
      return;
    }
    setSubmittedAddressQuery(query);
  }

  function editAddressSearch(event: ChangeEvent<HTMLInputElement>) {
    void addressSearchField.onChange(event);
    if (event.target.value.trim().length < 3) setSubmittedAddressQuery("");
    setValue("addressId", "", { shouldValidate: true });
    setValue("deliveryEtrapId", "", { shouldValidate: true });
    setIsAddressEditing(true);
    setIsAddressDropdownOpen(false);
    setAddressSearchError("");
  }

  function startAddressSearch() {
    const currentAddress =
      selectedLocationLabel ||
      selectedSavedAddress?.address ||
      deliveryQuote.data?.addressLine ||
      selectedAddressResult?.label;
    if (currentAddress) {
      setValue("addressSearch", currentAddress, { shouldValidate: true });
    }
    setIsAddressEditing(true);
    setIsAddressDropdownOpen(false);
    setAddressSearchError("");
  }

  function keepCurrentCoordinates() {
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setShowMap(true);
    setAddressSearchError("");
  }

  function handleAddressSearchKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) {
    const results = addressResults.data?.items ?? [];
    if (event.key === "Escape" && isAddressDropdownOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsAddressDropdownOpen(false);
      return;
    }
    if (event.key === "ArrowDown" && isAddressDropdownOpen && results.length) {
      event.preventDefault();
      setActiveAddressResultIndex((current) =>
        Math.min(results.length - 1, current + 1),
      );
      return;
    }
    if (event.key === "ArrowUp" && isAddressDropdownOpen && results.length) {
      event.preventDefault();
      setActiveAddressResultIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (isAddressDropdownOpen && results[activeAddressResultIndex]) {
      selectSearchResult(results[activeAddressResultIndex]);
      return;
    }
    findAddress();
  }

  function selectMapCoordinates(next: AssistedOrderCoordinates) {
    setValue("addressId", "", { shouldValidate: true });
    setValue("deliveryEtrapId", "", { shouldValidate: true });
    setCoordinates(next);
    setAddressMode("map");
    setSelectedAddressResult(null);
    setSelectedLocationLabel("");
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setSelectionError("");
  }

  function fillFromPreviousOrder(order: Order) {
    if (
      selectedItems.length > 0 &&
      !window.confirm("Заменить текущую корзину блюдами из прошлого заказа?")
    ) {
      return;
    }
    const result = repeatPreviousOrder(
      order,
      filterOrderableProducts(products.data ?? []),
    );
    setQuantityBySelection(result.quantities);
    setSelectedVariantByProduct(
      Object.fromEntries(
        order.items
          .flatMap((item) =>
            item.productVariantId
              ? [[item.productId, item.productVariantId]]
              : [],
          ),
      ),
    );
    setRepeatNotice(
      result.unavailable.length
        ? `Недоступные позиции не добавлены: ${result.unavailable.join(", ")}. Проверьте корзину и новые цены.`
        : "Блюда добавлены по текущему меню. Проверьте корзину и новые цены.",
    );
  }

  async function submit(values: AssistedOrderFormValues) {
    if (!selectedItems.length) {
      setSelectionError("Добавьте хотя бы одно блюдо");
      return;
    }
    if (addressMode === "map" && !coordinates) {
      setSelectionError("Поставьте точку на карте или выберите ввод адреса текстом");
      setStep("delivery");
      return;
    }
    if (!values.addressId && !coordinates && !values.address?.trim()) {
      setSelectionError("Введите адрес доставки или укажите точку на карте");
      return;
    }

    const deliverySelection = buildAssistedOrderDeliverySelection({
      values,
      coordinates,
      savedAddress: selectedSavedAddress,
      officialAddress:
        deliveryQuote.data?.addressLine ||
        selectedLocationLabel ||
        selectedAddressResult?.label,
    });
    if (!deliverySelection) {
      setSelectionError("Введите адрес доставки или укажите точку на карте");
      return;
    }

    const body = {
      customerPhone: values.customerPhone,
      customerFirstName: values.customerFirstName,
      customerLastName: values.customerLastName,
      items: selectedItems.map(({ product, variant, quantity }) => ({
        productId: product.id,
        ...(variant ? { variantId: variant.id } : {}),
        quantity,
      })),
      ...deliverySelection,
      customerNote: values.customerNote,
      promoCode: values.promoCode,
      ...(values.deliveryPriceMode === "MANUAL" ? {
        manualDeliveryFee: Number(values.manualDeliveryFee.replace(",", ".")),
        manualDeliveryReason: values.manualDeliveryReason,
      } : {}),
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
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setSelectedAddressResult(null);
    setCoordinates(null);
    setAddressMode("manual");
    setQuantityBySelection({});
    setSelectedVariantByProduct({});
    setProductSearch("");
    setRepeatNotice("");
    setShowMap(false);
    setSelectionError("");
    setStep("menu");
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
    <main className={`assisted-order-workspace assisted-step-${step}`} data-testid="assisted-order-workspace">
      <form
        className="modal assisted-order-modal"
        data-testid="assisted-order-form"
        noValidate
        onSubmit={(event) => {
          if (step === "review") {
            void handleSubmit(submit)(event);
            return;
          }
          event.preventDefault();
          if (step === "menu") goToDelivery();
          else void goToReview();
        }}
      >
        <header className="modal-head assisted-order-head">
          <div>
            <span className="eyebrow">НОВЫЙ ЗАКАЗ · ПО ЗВОНКУ</span>
            <h2 id="assisted-order-title">Приём заказа</h2>
          </div>
          <nav aria-label="Этапы заказа" className="assisted-order-steps" data-testid="assisted-order-steps">
            <button aria-current={step === "menu" ? "step" : undefined} data-testid="assisted-step-menu" onClick={() => setStep("menu")} type="button">1 · Блюда</button>
            <button aria-current={step === "delivery" ? "step" : undefined} data-testid="assisted-step-delivery" onClick={goToDelivery} type="button">2 · Клиент и доставка</button>
            <button aria-current={step === "review" ? "step" : undefined} data-testid="assisted-step-review" disabled={step !== "review"} type="button">3 · Проверка</button>
          </nav>
          <button
            aria-label="Закрыть"
            data-testid="assisted-order-close"
            type="button"
            onClick={requestClose}
          >
            ×
          </button>
        </header>

        {step === "review" && (
          <section className="assisted-order-review" data-testid="assisted-order-review">
            <h3>Проверьте заказ с клиентом</h3>
            <div className="assisted-review-grid">
              <section>
                <h4>Блюда</h4>
                {selectedItems.map(({ product, variant, quantity }) => (
                  <p key={selectionKey(product.id, variant?.id)}>{product.name}{variant ? ` · ${variant.name}` : ""} ×{quantity}</p>
                ))}
                <strong>{estimatedSubtotal.toFixed(2)} TMT · блюда</strong>
                <button className="text-button" data-testid="assisted-review-edit-menu" onClick={() => setStep("menu")} type="button">Изменить блюда</button>
              </section>
              <section>
                <h4>Клиент и доставка</h4>
                <p>{getValues("customerPhone")}{getValues("customerFirstName") ? ` · ${getValues("customerFirstName")}` : ""}</p>
                <p>{selectedSavedAddress && !getValues("address")?.trim() ? selectedSavedAddress.address : (coordinates
                  ? buildAssistedDeliveryAddress({
                      officialAddress: deliveryQuote.data?.addressLine || selectedLocationLabel || selectedAddressResult?.label,
                      unofficialAddress: getValues("address"),
                      coordinates,
                    })
                  : getValues("address") || "Адрес не указан")}</p>
                <p className="assisted-review-address-status" data-testid="assisted-review-address-status">
                  {coordinates ? "Точка на карте выбрана" : "Адрес текстом · точка на карте не подтверждена"}
                </p>
                {(getValues("entrance") || getValues("floor") || getValues("apartment")) && (
                  <p>Подъезд {getValues("entrance") || "—"} · этаж {getValues("floor") || "—"} · кв. {getValues("apartment") || "—"}</p>
                )}
                <strong>{displayedDeliveryFee === null ? "Доставка уточняется сервером" : `Доставка ${displayedDeliveryFee.toFixed(2)} TMT${deliveryPriceMode === "MANUAL" ? " · вручную" : ""}`}</strong>
                {deliveryPriceMode === "MANUAL" && <p>Причина: {getValues("manualDeliveryReason")}</p>}
                <button className="text-button" data-testid="assisted-review-edit-delivery" onClick={() => setStep("delivery")} type="button">Изменить доставку</button>
              </section>
            </div>
            <p className="assisted-review-payment">Оплата наличными при получении · итоговую цену и скидку подтвердит сервер.</p>
          </section>
        )}

        <section className="assisted-order-card assisted-customer-card" data-testid="assisted-customer-card">
              <div className="assisted-order-section-title">
                <div>
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
                  Найти
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
                  Новый клиент — оформим заказ по этому номеру.
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
                  Последний адрес выбран автоматически. При необходимости
                  смените его в блоке доставки.
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
              {selectedCustomer && (
                <details className="assisted-customer-history" data-testid="assisted-customer-history">
                  <summary data-testid="assisted-history-toggle">История заказов {history.data?.length ? `· ${history.data.length}` : ""}</summary>
                  <strong>Последние заказы</strong>
                  {history.isPending && <small>Загружаем историю…</small>}
                  {history.isError && (
                    <small className="form-error">История недоступна: {history.error.message}</small>
                  )}
                  {history.data?.length === 0 && <small>Заказов пока нет.</small>}
                  {history.data?.slice(0, 3).map((order) => (
                    <div className="assisted-history-order" key={order.id}>
                      <span>
                        <b>#{order.number}</b> · {new Date(order.createdAt).toLocaleDateString("ru-RU")}
                        <small>{order.items.map((item) => `${item.productName} ×${item.quantity}`).join(", ")}</small>
                      </span>
                      <button
                        className="secondary-button compact"
                        data-testid={`assisted-repeat-${order.id}`}
                        disabled={products.isPending}
                        onClick={() => fillFromPreviousOrder(order)}
                        type="button"
                      >
                        В корзину
                      </button>
                    </div>
                  ))}
                </details>
              )}
        </section>
        <div className="assisted-order-layout">
          <div className="assisted-order-column">
            <section className="assisted-order-card assisted-products-card">
              <div className="assisted-order-section-title">
                <div>
                  <strong>Меню</strong>
                </div>
                <small>
                  {selectedItems.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                  шт.
                </small>
              </div>
              <input
                aria-label="Поиск блюда"
                autoFocus
                className="assisted-product-search"
                data-testid="assisted-product-search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                placeholder="Найти блюдо или категорию"
                type="search"
              />
              <div
                aria-label="Фильтр блюд по категории"
                className="assisted-product-categories"
                data-testid="assisted-product-categories"
                role="group"
              >
                <button
                  aria-pressed={!productCategoryFilter}
                  className={!productCategoryFilter ? "active" : ""}
                  data-testid="assisted-product-category-all"
                  onClick={() => setProductCategoryFilter("")}
                  type="button"
                >
                  Все
                </button>
                {activeProductGroups.map((group) => (
                  <button
                    aria-pressed={productCategoryFilter === group.id}
                    className={
                      productCategoryFilter === group.id ? "active" : ""
                    }
                    data-testid={`assisted-product-category-${group.id}`}
                    key={group.id}
                    onClick={() => setProductCategoryFilter(group.id)}
                    type="button"
                  >
                    {group.name} <span>{group.products.length}</span>
                  </button>
                ))}
              </div>
              {products.isPending && <p className="muted">Загружаем меню…</p>}
              {products.isError && (
                <p className="form-error">{products.error.message}</p>
              )}
              <div
                className="assisted-product-list"
                data-testid="assisted-product-groups"
              >
                {visibleProductGroups.map((group) => (
                  <section
                    className="assisted-product-group"
                    data-testid={`assisted-product-group-${group.id}`}
                    key={group.id}
                  >
                    <header>
                      <strong>{group.name}</strong>
                      <span>{group.products.length}</span>
                    </header>
                    <div>
                      {group.products.map((product) => {
                        const variants = activeVariants(product);
                        const requiresVariant =
                          product.pricingType === "VARIANT";
                        const selectedVariant =
                          variants.find(
                            ({ id }) =>
                              selectedVariantByProduct[product.id] === id,
                          ) ?? null;
                        const currentSelectionKey = selectionKey(
                          product.id,
                          selectedVariant?.id,
                        );
                        const quantity =
                          quantityBySelection[currentSelectionKey] ?? 0;
                        const selectedVariantItems = variants.filter(
                          ({ id }) =>
                            (quantityBySelection[
                              selectionKey(product.id, id)
                            ] ?? 0) > 0,
                        );
                        const displayImageUrl =
                          selectedVariant?.images[0]?.url ??
                          product.displayImageUrl;
                        return (
                          <article
                            className={
                              selectedVariantItems.length || quantity
                                ? "selected"
                                : ""
                            }
                            key={product.id}
                          >
                            {displayImageUrl ? (
                              <img
                                alt={selectedVariant?.name ?? product.name}
                                height="52"
                                loading="lazy"
                                src={resolveApiUrl(displayImageUrl)}
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
                              {requiresVariant && (
                                <label className="assisted-product-variant">
                                  <span>
                                    {product.variantLabel ?? "Вариант"}
                                  </span>
                                  <select
                                    data-testid={`assisted-product-variant-${product.id}`}
                                    value={selectedVariant?.id ?? ""}
                                    onChange={(event) =>
                                      setSelectedVariantByProduct(
                                        (current) => ({
                                          ...current,
                                          [product.id]: event.target.value,
                                        }),
                                      )
                                    }
                                  >
                                    <option value="" disabled>
                                      Выберите вариант
                                    </option>
                                    {variants.map((variant) => (
                                      <option
                                        key={variant.id}
                                        value={variant.id}
                                      >
                                        {variant.name} —{" "}
                                        {variant.price.toFixed(2)} TMT
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              <b>
                                {requiresVariant && !selectedVariant
                                  ? "от "
                                  : ""}
                                {(
                                  selectedVariant?.price ?? product.minPrice
                                ).toFixed(2)}{" "}
                                TMT
                              </b>
                              {selectedVariantItems.length > 0 && (
                                <small className="assisted-selected-variants">
                                  Добавлено:{" "}
                                  {selectedVariantItems
                                    .map(
                                      (variant) =>
                                        `${variant.name} ×${quantityBySelection[selectionKey(product.id, variant.id)]}`,
                                    )
                                    .join(", ")}
                                </small>
                              )}
                            </div>
                            <div
                              className="quantity-stepper"
                              aria-label={`Количество ${product.name}`}
                              role="group"
                            >
                              {quantity > 0 && (
                                <>
                                  <button
                                    aria-label={`Убрать ${product.name}`}
                                    data-testid={`assisted-product-minus-${product.id}`}
                                    type="button"
                                    onClick={() => changeQuantity(product.id, selectedVariant?.id, -1)}
                                  >
                                    −
                                  </button>
                                  <output>{quantity}</output>
                                </>
                              )}
                              <button
                                aria-label={`Добавить ${product.name}`}
                                className={quantity === 0 ? "assisted-add-product" : ""}
                                data-testid={`assisted-product-plus-${product.id}`}
                                type="button"
                                disabled={requiresVariant && !selectedVariant}
                                onClick={() => changeQuantity(product.id, selectedVariant?.id, 1)}
                              >
                                {quantity === 0 ? "Добавить" : "+"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {!products.isPending && !products.data?.length && (
                <p className="assisted-order-hint" role="status">
                  На сервере нет активного меню. Загрузите каталог, чтобы
                  принимать заказы.
                </p>
              )}
              {!products.isPending && Boolean(products.data?.length) && !visibleProducts.length && (
                <p className="assisted-order-hint">
                  По этому запросу блюд нет. Попробуйте другое название или категорию.
                </p>
              )}
            </section>
          </div>

          <div className="assisted-order-column">
            <section className="assisted-order-card assisted-cart-card" data-testid="assisted-order-cart">
              <div className="assisted-order-section-title">
                <div><strong>Состав заказа</strong></div>
                <small>{selectedItems.reduce((sum, item) => sum + item.quantity, 0)} шт.</small>
              </div>
              {selectedItems.length === 0 ? (
                <p className="assisted-order-hint">Нажимайте «+» у блюд — они появятся здесь.</p>
              ) : (
                <div className="assisted-cart-lines">
                  {selectedItems.map(({ product, variant, quantity }) => (
                    <div className="assisted-cart-line" key={selectionKey(product.id, variant?.id)}>
                      <span>
                        <strong>{product.name}{variant ? ` · ${variant.name}` : ""}</strong>
                        <small>{((variant?.price ?? product.price) * quantity).toFixed(2)} TMT</small>
                      </span>
                      <div className="quantity-stepper" role="group" aria-label={`Количество ${product.name}`}>
                        <button data-testid={`assisted-cart-minus-${selectionKey(product.id, variant?.id)}`} type="button" onClick={() => changeQuantity(product.id, variant?.id, -1)}>−</button>
                        <output>{quantity}</output>
                        <button data-testid={`assisted-cart-plus-${selectionKey(product.id, variant?.id)}`} type="button" onClick={() => changeQuantity(product.id, variant?.id, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {repeatNotice && <p className="assisted-order-hint" role="status">{repeatNotice}</p>}
              <div className="assisted-order-total"><span>Блюда по текущему меню</span><strong>{estimatedSubtotal.toFixed(2)} TMT</strong></div>
            </section>
            <div className="assisted-order-details-column" data-testid="assisted-order-details">
            <section
              className="assisted-order-card assisted-address-card"
              data-testid="assisted-address-workflow"
            >
              <div className="assisted-order-section-title">
                <div>
                  <strong>Доставка</strong>
                </div>
              </div>
              {selectedCustomer?.addresses.length ? (
                <label className="assisted-address-saved-select">
                  <span>Адрес клиента</span>
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
                    <option value="">Новый адрес</option>
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
              {selectedSavedAddress && (
                <div className="assisted-selected-address" data-testid="assisted-saved-address-summary">
                  <div>
                    <span>{selectedSavedAddress.locationStatus === "MANUAL_UNVERIFIED" ? "Адрес без точки на карте" : "Сохранённый адрес"}</span>
                    <strong>{selectedSavedAddress.address}</strong>
                  </div>
                </div>
              )}
              <fieldset className="assisted-address-method" data-testid="assisted-address-method">
                <legend>Как указать место доставки?</legend>
                <div className="assisted-address-method-options">
                  <button
                    aria-pressed={addressMode === "manual"}
                    className={addressMode === "manual" ? "active" : ""}
                    data-testid="assisted-address-method-manual"
                    onClick={useManualAddress}
                    type="button"
                  >
                    Ввести адрес текстом
                  </button>
                  <button
                    aria-pressed={addressMode === "map"}
                    className={addressMode === "map" ? "active" : ""}
                    data-testid="assisted-address-method-map"
                    onClick={useMapAddress}
                    type="button"
                  >
                    Указать точку на карте
                  </button>
                </div>
                <small className="assisted-order-hint" data-testid="assisted-address-method-hint">
                  {addressMode === "manual"
                    ? "Напишите улицу, дом и ориентир. Заказ сохранится без координат с пометкой для курьера."
                    : "Поставьте маркер в точное место доставки. Если адреса нет в поиске, нажмите на карту вручную."}
                </small>
              </fieldset>
              <label className="assisted-address-primary">
                <span>{addressMode === "map" ? "Уточнение для курьера (необязательно)" : "Адрес доставки"}</span>
                <textarea
                  data-testid="assisted-order-address"
                  {...deliveryAddressField}
                  onChange={(event) => {
                    void deliveryAddressField.onChange(event);
                    if (addressMode === "manual" && selectedAddressId) {
                      setValue("addressId", "", { shouldDirty: true });
                      setValue("deliveryEtrapId", "", { shouldDirty: true });
                      setSelectedLocationLabel("");
                    }
                    setSelectionError("");
                  }}
                  aria-invalid={Boolean(errors.address)}
                  maxLength={500}
                  rows={2}
                  placeholder={addressMode === "map" ? "Например: вход со двора" : "Улица, дом, ориентир — как продиктовал клиент"}
                />
                <FormFieldError message={errors.address?.message} />
              </label>
              {addressMode === "map" && (
                <button
                  aria-expanded={showMap}
                  className="secondary-button compact assisted-map-toggle"
                  data-testid="assisted-map-toggle"
                  onClick={() => setShowMap((current) => !current)}
                  type="button"
                >
                  {showMap ? "Скрыть карту" : "Показать карту и уточнить точку"}
                </button>
              )}
              {addressMode === "map" && showMap && (
                <>
              {(!coordinates || isAddressEditing) && (
                <section
                  className="assisted-address-search-panel"
                  data-testid="assisted-address-search-panel"
                >
                  <div className="assisted-address-stage-heading">
                    <div>
                      <strong>Найдите улицу или дом</strong>
                      <small>
                        Введите улицу и номер дома, затем выберите один вариант
                        ниже.
                      </small>
                    </div>
                    {coordinates && (
                      <button
                        className="text-button compact"
                        data-testid="assisted-address-search-cancel"
                        type="button"
                        onClick={keepCurrentCoordinates}
                      >
                        Оставить текущую точку
                      </button>
                    )}
                  </div>
                  <div
                    className="assisted-address-combobox"
                    data-testid="assisted-address-combobox"
                    ref={addressComboboxRef}
                  >
                    <div className="assisted-address-search">
                      <label>
                        <span>Улица, дом или известное место</span>
                        <input
                          {...addressSearchField}
                          aria-autocomplete="list"
                          aria-controls={
                            isAddressDropdownOpen
                              ? "assisted-address-listbox"
                              : undefined
                          }
                          aria-expanded={isAddressDropdownOpen}
                          aria-haspopup="listbox"
                          aria-activedescendant={
                            isAddressDropdownOpen &&
                            addressResults.data?.items[activeAddressResultIndex]
                              ? `assisted-address-option-${activeAddressResultIndex}`
                              : undefined
                          }
                          data-testid="assisted-address-search-input"
                          onChange={editAddressSearch}
                          onFocus={() => {
                            if (
                              addressResults.data &&
                              getValues("addressSearch").trim() ===
                                submittedAddressQuery
                            ) {
                              setIsAddressDropdownOpen(true);
                            }
                          }}
                          onKeyDown={handleAddressSearchKeyDown}
                          placeholder="Например: Garaşsyzlyk şaýoly 60"
                          role="combobox"
                        />
                        <FormFieldError
                          message={errors.addressSearch?.message}
                        />
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
                    {isAddressDropdownOpen && (
                      <div
                        aria-busy={addressResults.isFetching}
                        className="assisted-search-results assisted-address-results"
                        data-testid="assisted-address-results"
                        id="assisted-address-listbox"
                        role="listbox"
                      >
                        <strong className="assisted-address-results-title">
                          Выберите вариант — карта переместится к нему
                        </strong>
                        {addressResults.isFetching && (
                          <p className="assisted-order-hint">Ищем на карте…</p>
                        )}
                        {addressResults.isError && (
                          <p className="form-error">
                            {addressResults.error.message}
                          </p>
                        )}
                        {addressResults.data?.items.map((result, index) => (
                          <button
                            aria-selected={index === activeAddressResultIndex}
                            className={
                              index === activeAddressResultIndex
                                ? "selected"
                                : ""
                            }
                            data-testid={`assisted-address-result-${result.provider}-${result.latitude}-${result.longitude}`}
                            id={`assisted-address-option-${index}`}
                            key={`${result.provider}:${result.latitude}:${result.longitude}`}
                            role="option"
                            type="button"
                            onClick={() => selectSearchResult(result)}
                            onMouseEnter={() =>
                              setActiveAddressResultIndex(index)
                            }
                          >
                            <strong>{result.label}</strong>
                            {result.aliases.length > 0 && (
                              <small>
                                Также: {result.aliases.slice(0, 3).join(" · ")}
                              </small>
                            )}
                            <b>Выбрать и показать на карте</b>
                          </button>
                        ))}
                        {addressResults.data &&
                          !addressResults.isFetching &&
                          !addressResults.data.items.length && (
                            <p className="assisted-address-empty">
                              Адреса нет в базе. Можно поставить точку на карте
                              или ввести адрес текстом ниже.
                            </p>
                          )}
                        {addressResults.data && (
                          <small className="map-attribution">
                            {addressResults.data.attribution}
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {coordinates && !isAddressEditing && (
                <div
                  className="assisted-selected-address"
                  data-testid="assisted-selected-address"
                >
                  <div>
                    <span>Точка доставки выбрана</span>
                    <strong>
                      {selectedLocationLabel ||
                        selectedSavedAddress?.address ||
                        deliveryQuote.data?.addressLine ||
                        selectedAddressResult?.label ||
                        `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`}
                    </strong>
                    <small>
                      Маркер можно уточнить кликом по карте или перетаскиванием.
                    </small>
                  </div>
                  <button
                    className="secondary-button compact"
                    data-testid="assisted-address-change"
                    type="button"
                    onClick={startAddressSearch}
                  >
                    Найти другую точку
                  </button>
                </div>
              )}
              <div className="assisted-address-map-heading">
                <strong>Проверьте точку на карте</strong>
                <span>
                  Карта меняется после выбора найденного адреса или клика по
                  карте.
                </span>
              </div>
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
                </>
              )}
              <div
                className="assisted-delivery-summary"
                data-testid="assisted-delivery-pricing"
              >
                <input type="hidden" {...register("deliveryEtrapId")} />
                <strong>{coordinates || selectedAddressId ? "Доставка по выбранному адресу" : "Доставка по адресу без точки"}</strong>
                {activeDeliveryQuote.data?.tariff === "NIGHT" && <span data-testid="assisted-delivery-night-tariff">Ночной тариф · время Ашхабада</span>}
                {!selectedAddressId && suggestedDeliveryEtrap && (
                  <span
                    className="assisted-delivery-match"
                    data-testid="assisted-delivery-etrap-auto"
                    role="status"
                  >
                    Район определён по адресу: {suggestedDeliveryEtrap.nameRu}
                    {" · "}доставка {deliveryQuote.data?.fee.toFixed(2)} TMT
                  </span>
                )}
                {!selectedAddressId && deliveryQuote.data && !suggestedDeliveryEtrap && (
                  <span
                    className="assisted-delivery-match"
                    data-testid="assisted-delivery-fallback"
                    role="status"
                  >
                    Точка принята · доставка по базовому тарифу{" "}
                    {deliveryQuote.data.fee.toFixed(2)} TMT
                  </span>
                )}
                {deliveryQuote.isFetching && !selectedAddressId && (
                  <span className="assisted-order-hint" role="status">
                    Определяем адрес и цену доставки…
                  </span>
                )}
                {activeDeliveryQuote.isError && (
                  <span className="form-error">
                    Не удалось показать предварительную цену. Стоимость доставки
                    будет рассчитана при создании заказа.
                  </span>
                )}
                {selectedAddressId && (
                  <span className="assisted-order-hint" role="status">
                    {distancePricingEnabled && coordinates
                      ? estimatedDeliveryFee === null
                        ? "Сохранённый адрес · рассчитываем цену по расстоянию"
                        : `Сохранённый адрес · по расстоянию ${estimatedDeliveryFee.toFixed(2)} TMT`
                      : selectedDeliveryEtrap
                      ? `${selectedDeliveryEtrap.nameRu} · доставка ${estimatedDeliveryFee?.toFixed(2)} TMT`
                      : estimatedDeliveryFee === null
                        ? "Сохранённый адрес · рассчитываем цену доставки"
                        : `Сохранённый адрес · базовая доставка ${estimatedDeliveryFee.toFixed(2)} TMT`}
                  </span>
                )}
                {!coordinates && !selectedAddressId && (
                  <span className="assisted-order-hint">
                    Без точки на карте адрес помечается «не проверен».
                    {distancePricingEnabled && " Доставка — по резервному тарифу."}
                  </span>
                )}
              </div>
              <fieldset className="assisted-delivery-fee-control" data-testid="assisted-delivery-fee-control">
                <legend>Цена доставки</legend>
                <p className="assisted-order-hint">Автоматический тариф — подсказка. Для заказа по звонку вы можете назначить свою цену, в том числе 0 TMT.</p>
                <div className="assisted-delivery-fee-modes">
                  <label><input data-testid="assisted-delivery-fee-auto" type="radio" value="AUTO" {...register("deliveryPriceMode")} /> По тарифу{estimatedDeliveryFee === null ? " · рассчитывается" : ` · ${estimatedDeliveryFee.toFixed(2)} TMT`}</label>
                  <label><input data-testid="assisted-delivery-fee-manual" type="radio" value="MANUAL" {...register("deliveryPriceMode")} /> Указать вручную</label>
                </div>
                {deliveryPriceMode === "MANUAL" && (
                  <div className="assisted-delivery-fee-fields">
                    <label>
                      <span>Доставка, TMT</span>
                      <input data-testid="assisted-manual-delivery-fee" {...register("manualDeliveryFee")} inputMode="decimal" placeholder="Например: 12,50" aria-invalid={Boolean(errors.manualDeliveryFee)} />
                      <FormFieldError message={errors.manualDeliveryFee?.message} />
                    </label>
                    <label>
                      <span>Причина ручной цены</span>
                      <input data-testid="assisted-manual-delivery-reason" {...register("manualDeliveryReason")} maxLength={200} placeholder="Например: согласовано с клиентом" aria-invalid={Boolean(errors.manualDeliveryReason)} />
                      <FormFieldError message={errors.manualDeliveryReason?.message} />
                    </label>
                    <small>Сумма и причина сохранятся в журнале вместе с именем сотрудника. Итог проверит сервер.</small>
                  </div>
                )}
              </fieldset>
              <details
                className="assisted-courier-address-details"
                data-testid="assisted-courier-address-details"
              >
                <summary data-testid="assisted-address-details-toggle">Подъезд, этаж, квартира</summary>
                <div className="modal-grid assisted-address-details">
                  <label>
                    <span>Название адреса</span>
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
                      placeholder="Например: 2"
                    />
                  </label>
                  <label>
                    <span>Этаж</span>
                    <input
                      data-testid="assisted-address-floor"
                      {...register("floor")}
                      placeholder="Например: 4"
                    />
                  </label>
                  <label>
                    <span>Квартира</span>
                    <input
                      data-testid="assisted-address-apartment"
                      {...register("apartment")}
                      placeholder="Например: 18"
                    />
                  </label>
                </div>
              </details>
            </section>

            <details className="assisted-order-card assisted-order-extra" ref={extraDetailsRef}>
              <summary data-testid="assisted-order-extra-toggle">Комментарий и промокод</summary>
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
                  <span>Комментарий к заказу</span>
                  <textarea
                    data-testid="assisted-order-note"
                    {...register("customerNote")}
                    maxLength={500}
                    rows={3}
                    placeholder="Например: без лука, соус отдельно"
                    aria-describedby="assisted-order-note-hint"
                  />
                  <small id="assisted-order-note-hint">
                    До 500 символов. Отображается в заказе и печатается в чеке.
                  </small>
                  <FormFieldError message={errors.customerNote?.message} />
                </label>
              </div>
            </details>
            </div>
          </div>
        </div>

        {(selectionError || actions.create.error) && (
          <div className="inline-alert" role="alert">
            {selectionError || mutationMessage(actions.create.error)}
          </div>
        )}
        <footer className="modal-actions assisted-order-actions">
          <div>
            <small>{step === "menu" ? "Блюда по текущему меню" : "Наличные · окончательная сумма после проверки сервером"}</small>
            <strong>
              {step === "menu"
                ? `${estimatedSubtotal.toFixed(2)} TMT`
                : displayedDeliveryFee === null || estimatedTotal === null
                ? `${estimatedSubtotal.toFixed(2)} TMT + доставка`
                : `${estimatedTotal.toFixed(2)} TMT · доставка ${displayedDeliveryFee.toFixed(2)} TMT${deliveryPriceMode === "MANUAL" ? " вручную" : ""}`}
            </strong>
          </div>
          <button className="secondary-button" data-testid="assisted-order-cancel" type="button" onClick={step === "menu" ? requestClose : () => setStep(step === "review" ? "delivery" : "menu")}>
            {step === "menu" ? "Отмена" : "← Назад"}
          </button>
          <button
            className="primary-button"
            data-testid="assisted-order-submit"
            disabled={actions.create.isPending}
            type="submit"
          >
            {actions.create.isPending ? "Создаём…" : step === "menu" ? "Далее →" : step === "delivery" ? "К проверке →" : "Подтвердить заказ"}
          </button>
        </footer>
      </form>
    </main>
  );
}
