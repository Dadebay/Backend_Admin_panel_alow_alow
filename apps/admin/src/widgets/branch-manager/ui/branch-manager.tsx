import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { ColumnDef } from "@tanstack/react-table";
import {
  useBranches,
  type Branch,
  type CreateBranch,
} from "@/src/entities/branch";
import { useBranchActions } from "@/src/features/branch-management";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  branchFormSchema,
  type BranchFormInput,
  type BranchFormValues,
} from "../model/branch-form";
import type { BranchCoordinates } from "../model/branch-coordinates";

const BranchLocationPicker = lazy(() => import("./branch-location-picker"));

export function BranchManager() {
  const { session } = useSession();
  const branches = useBranches();
  const actions = useBranchActions();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedCoordinates, setSelectedCoordinates] =
    useState<BranchCoordinates | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BranchFormInput, unknown, BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      isActive: true,
      isPrimary: false,
    },
  });
  const canEdit = Boolean(
    session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );
  const pending =
    actions.createBranch.isPending || actions.updateBranch.isPending;
  const openEditor = useCallback((branch: Branch | null) => {
    setEditing(branch);
    reset({
      name: branch?.name ?? "",
      phone: branch?.phone ?? "",
      address: branch?.address ?? "",
      isActive: branch?.isActive ?? true,
      isPrimary: branch?.isPrimary ?? false,
    });
    setSelectedCoordinates(
      branch
        ? { latitude: branch.latitude, longitude: branch.longitude }
        : null,
    );
    setShowForm(true);
  }, [reset]);

  function closeEditor() {
    setEditing(null);
    setSelectedCoordinates(null);
    reset();
    setShowForm(false);
  }

  function selectCoordinates(coordinates: BranchCoordinates) {
    setSelectedCoordinates(coordinates);
  }

  const columns = useMemo<ColumnDef<Branch, unknown>[]>(
    () => [
      {
        header: "Филиал",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.name}</strong>
            {row.original.isPrimary && <small>Главный филиал · резервный маршрут</small>}
            <small>{row.original.address}</small>
          </div>
        ),
      },
      {
        header: "Координаты",
        cell: ({ row }) => (
          <span className="coordinate-value">
            {row.original.latitude.toFixed(6)}, {row.original.longitude.toFixed(6)}
          </span>
        ),
      },
      {
        header: "Телефон",
        cell: ({ row }) =>
          row.original.phone ? (
            <a href={`tel:${row.original.phone}`}>{row.original.phone}</a>
          ) : (
            <span className="muted">Не указан</span>
          ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Принимает заказы" : "Отключён"}
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
                data-testid={`branch-edit-${row.original.id}`}
                type="button"
                onClick={() => openEditor(row.original)}
              >
                Изменить
              </button>
              <button
                className="text-button"
                data-testid={`branch-toggle-${row.original.id}`}
                type="button"
                disabled={actions.updateBranch.isPending}
                onClick={() =>
                  actions.updateBranch.mutate({
                    id: row.original.id,
                    body: {
                      isActive: !row.original.isActive,
                      isPrimary: row.original.isPrimary,
                    },
                  })
                }
              >
                {row.original.isActive ? "Отключить" : "Включить"}
              </button>
            </div>
          ),
      },
    ],
    [actions.updateBranch, canEdit, openEditor],
  );

  async function submit(values: BranchFormValues) {
    if (!selectedCoordinates) return;
    const body: CreateBranch = {
      name: values.name,
      address: values.address,
      latitude: selectedCoordinates.latitude,
      longitude: selectedCoordinates.longitude,
      phone: values.phone,
      isActive: editing ? values.isActive : true,
      isPrimary: values.isPrimary,
    };

    if (editing) {
      await actions.updateBranch.mutateAsync({
        id: editing.id,
          body: {
            ...body,
            phone: values.phone ?? "",
        },
      });
    } else {
      await actions.createBranch.mutateAsync(body);
    }
    closeEditor();
  }

  const mutationError =
    actions.createBranch.error || actions.updateBranch.error;

  return (
    <section className="admin-section" data-testid="branch-manager">
      <header className="section-head" data-testid="branch-header">
        <div>
          <span className="eyebrow">ТОЧКИ ПРИГОТОВЛЕНИЯ И ВЫДАЧИ</span>
          <h1>Филиалы</h1>
          <p>
            Новый заказ автоматически получает ближайший активный филиал по
            координатам адреса клиента.
          </p>
        </div>
        {canEdit && (
          <div
            className="header-actions section-header-actions"
            data-testid="branch-header-actions"
          >
            <button
              className="primary-button"
              data-testid="branch-create-open"
              type="button"
              onClick={() => {
                if (showForm) closeEditor();
                else openEditor(null);
              }}
            >
              + Филиал
            </button>
          </div>
        )}
      </header>

      {mutationError && (
        <div className="inline-alert" role="alert">
          {mutationError instanceof Error ? mutationError.message : ""}
        </div>
      )}

      {showForm && (
        <form
          className="editor-card"
          data-testid="branch-form"
          noValidate
          onSubmit={handleSubmit(submit)}
        >
          <div className="editor-title">
            <h2>{editing ? "Изменить филиал" : "Новый филиал"}</h2>
            <button
              className="text-button"
              data-testid="branch-form-close"
              type="button"
              onClick={closeEditor}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Название</span>
              <input
                data-testid="branch-name"
                {...register("name")}
                aria-invalid={Boolean(errors.name)}
                maxLength={160}
              />
              <FormFieldError message={errors.name?.message} />
            </label>
            <label>
              <span>Телефон</span>
              <input
                data-testid="branch-phone"
                {...register("phone")}
                aria-invalid={Boolean(errors.phone)}
                type="tel"
                placeholder="+99365123456"
              />
              <FormFieldError message={errors.phone?.message} />
            </label>
            <label className="wide-field">
              <span>Адрес</span>
              <input
                data-testid="branch-address"
                {...register("address")}
                aria-invalid={Boolean(errors.address)}
                maxLength={500}
              />
              <FormFieldError message={errors.address?.message} />
            </label>
            {editing && (
              <label className="check-field">
                <input
                  data-testid="branch-active"
                  {...register("isActive")}
                  type="checkbox"
                />
                Принимает новые заказы
              </label>
            )}
            <label className="check-field">
              <input
                data-testid="branch-primary"
                {...register("isPrimary")}
                type="checkbox"
              />
              Главный филиал (резерв для заказов)
            </label>
            <div className="branch-location-field">
              <Suspense fallback={<div className="map-loading">Загружаем карту…</div>}>
                <BranchLocationPicker
                  coordinates={selectedCoordinates}
                  onChange={selectCoordinates}
                />
              </Suspense>
            </div>
          </div>
          <button
            className="primary-button"
            data-testid="branch-save"
            disabled={pending || !selectedCoordinates}
          >
            {pending
              ? "Сохраняем…"
              : selectedCoordinates
                ? "Сохранить филиал"
                : "Укажите место на карте"}
          </button>
        </form>
      )}

      <article className="table-card" data-testid="branch-table-card">
        <div className="card-title">
          <h2>Все филиалы</h2>
          <span>{branches.data?.length ?? 0}</span>
        </div>
        <AsyncPanel
          pending={branches.isPending}
          error={branches.error}
          onRetry={() => void branches.refetch()}
        >
          <DataTable
            columns={columns}
            data={branches.data ?? []}
            getRowId={(branch) => branch.id}
            empty="Филиалов пока нет. Без активного филиала новые заказы не принимаются."
            label="Филиалы A7-tagam"
          />
        </AsyncPanel>
      </article>
    </section>
  );
}
