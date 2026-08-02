import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { roleLabels } from "@/src/entities/order";
import { useStaff, type Staff } from "@/src/entities/staff";
import { useStaffActions } from "@/src/features/staff-management";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  staffFormSchema,
  staffRoles,
  type StaffFormInput,
  type StaffFormValues,
} from "../model/staff-form";

export function StaffManager() {
  const { session } = useSession();
  const staff = useStaff();
  const actions = useStaffActions();
  const [editing, setEditing] = useState<Staff | null>(null);
  const [showForm, setShowForm] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StaffFormInput, unknown, StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    mode: "onBlur",
    defaultValues: {
      phone: "",
      firstName: "",
      lastName: "",
      role: "OPERATOR",
      isActive: true,
    },
  });
  const canEdit = Boolean(
    session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );

  const columns = useMemo<ColumnDef<Staff, unknown>[]>(
    () => [
      {
        header: "Сотрудник",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>
              {[row.original.firstName, row.original.lastName]
                .filter(Boolean)
                .join(" ") || "Без имени"}
            </strong>
            <a href={`tel:${row.original.phone}`}>{row.original.phone}</a>
          </div>
        ),
      },
      {
        header: "Роль",
        cell: ({ row }) => roleLabels[row.original.role],
      },
      {
        header: "Работа",
        cell: ({ row }) => (
          <span className="muted">
            доставок {row.original._count.courierOrders} · кухня{" "}
            {row.original._count.cookedOrders}
          </span>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Активен" : "Отключён"}
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
                  setEditing(row.original);
                  reset({
                    phone: row.original.phone,
                    firstName: row.original.firstName ?? "",
                    lastName: row.original.lastName ?? "",
                    role:
                      staffRoles.find((role) => role === row.original.role) ??
                      "OPERATOR",
                    isActive: row.original.isActive,
                  });
                  setShowForm(true);
                }}
              >
                Изменить
              </button>
              <button
                className="text-button"
                disabled={actions.updateStaff.isPending}
                onClick={() =>
                  actions.updateStaff.mutate({
                    id: row.original.id,
                    body: {
                      role: row.original.role,
                      isActive: !row.original.isActive,
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
    [actions.updateStaff, canEdit, reset],
  );

  async function submit(values: StaffFormValues) {
    if (editing) {
      await actions.updateStaff.mutateAsync({
        id: editing.id,
        body: {
          role: values.role,
          firstName: values.firstName,
          lastName: values.lastName,
          isActive: values.isActive,
        },
      });
    } else {
      await actions.createStaff.mutateAsync({
        phone: values.phone,
        role: values.role,
        firstName: values.firstName,
        lastName: values.lastName,
      });
    }
    setEditing(null);
    setShowForm(false);
  }

  const mutationError = actions.createStaff.error || actions.updateStaff.error;

  return (
    <section className="admin-section">
      <header className="section-head">
        <div>
          <span className="eyebrow">ДОСТУПЫ И РОЛИ</span>
          <h1>Команда</h1>
          <p>
            Операторы, повара, курьеры и бухгалтеры. Изменения пишутся в аудит.
          </p>
        </div>
        {canEdit && (
          <button
            className="primary-button"
            onClick={() => {
              setEditing(null);
              reset();
              setShowForm((value) => !value);
            }}
          >
            + Сотрудник
          </button>
        )}
      </header>

      {mutationError && (
        <div className="inline-alert">
          {mutationError instanceof Error ? mutationError.message : ""}
        </div>
      )}

      {showForm && (
        <form
          className="editor-card"
          data-testid="staff-form"
          noValidate
          onSubmit={handleSubmit(submit)}
        >
          <div className="editor-title">
            <h2>{editing ? "Изменить сотрудника" : "Новый сотрудник"}</h2>
            <button
              className="text-button"
              type="button"
              data-testid="staff-form-close"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                reset();
              }}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            {!editing && (
              <label>
                <span>Телефон</span>
                <input
                  data-testid="staff-phone"
                  {...register("phone")}
                  aria-invalid={Boolean(errors.phone)}
                  type="tel"
                  placeholder="+99365123456"
                />
                <FormFieldError message={errors.phone?.message} />
              </label>
            )}
            <label>
              <span>Имя</span>
              <input
                data-testid="staff-first-name"
                {...register("firstName")}
                aria-invalid={Boolean(errors.firstName)}
              />
              <FormFieldError message={errors.firstName?.message} />
            </label>
            <label>
              <span>Фамилия</span>
              <input
                data-testid="staff-last-name"
                {...register("lastName")}
                aria-invalid={Boolean(errors.lastName)}
              />
              <FormFieldError message={errors.lastName?.message} />
            </label>
            <label>
              <span>Роль</span>
              <select
                data-testid="staff-role"
                {...register("role")}
                aria-invalid={Boolean(errors.role)}
              >
                {staffRoles
                  .filter(
                    (role) =>
                      role !== "SUPER_ADMIN" ||
                      session?.user.role === "SUPER_ADMIN",
                  )
                  .map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
              </select>
              <FormFieldError message={errors.role?.message} />
            </label>
            {editing && (
              <label className="check-field">
                <input
                  data-testid="staff-active"
                  {...register("isActive")}
                  type="checkbox"
                />
                Активен
              </label>
            )}
          </div>
          <button
            className="primary-button"
            data-testid="staff-save"
            disabled={
              actions.createStaff.isPending || actions.updateStaff.isPending
            }
          >
            Сохранить сотрудника
          </button>
        </form>
      )}

      <article className="table-card">
        <AsyncPanel
          pending={staff.isPending}
          error={staff.error}
          onRetry={() => void staff.refetch()}
        >
          <DataTable
            columns={columns}
            data={staff.data ?? []}
            getRowId={(member) => member.id}
            empty="Сотрудников пока нет"
            label="Команда AlowAlow"
          />
        </AsyncPanel>
      </article>
    </section>
  );
}
