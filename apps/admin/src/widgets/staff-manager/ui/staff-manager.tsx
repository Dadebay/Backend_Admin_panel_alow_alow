import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { roleLabels, type Role } from "@/src/entities/order";
import { useStaff, type Staff } from "@/src/entities/staff";
import { useStaffActions } from "@/src/features/staff-management";
import { useSession } from "@/src/shared/auth";
import { AsyncPanel, DataTable } from "@/src/shared/ui";

const staffRoles: Role[] = [
  "OPERATOR",
  "COOK",
  "COURIER",
  "ACCOUNTANT",
  "ADMIN",
  "SUPER_ADMIN",
];

export function StaffManager() {
  const { session } = useSession();
  const staff = useStaff();
  const actions = useStaffActions();
  const [editing, setEditing] = useState<Staff | null>(null);
  const [showForm, setShowForm] = useState(false);
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
    [actions.updateStaff, canEdit],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get("role")) as Role;
    const firstName = String(form.get("firstName") ?? "").trim() || undefined;
    const lastName = String(form.get("lastName") ?? "").trim() || undefined;
    if (editing) {
      await actions.updateStaff.mutateAsync({
        id: editing.id,
        body: {
          role,
          firstName,
          lastName,
          isActive: form.get("isActive") === "on",
        },
      });
    } else {
      await actions.createStaff.mutateAsync({
        phone: String(form.get("phone")).trim(),
        role,
        firstName,
        lastName,
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
        <form className="editor-card" onSubmit={submit}>
          <div className="editor-title">
            <h2>{editing ? "Изменить сотрудника" : "Новый сотрудник"}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowForm(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="form-grid">
            {!editing && (
              <label>
                <span>Телефон</span>
                <input
                  name="phone"
                  type="tel"
                  placeholder="+99365123456"
                  required
                />
              </label>
            )}
            <label>
              <span>Имя</span>
              <input name="firstName" defaultValue={editing?.firstName ?? ""} />
            </label>
            <label>
              <span>Фамилия</span>
              <input name="lastName" defaultValue={editing?.lastName ?? ""} />
            </label>
            <label>
              <span>Роль</span>
              <select name="role" defaultValue={editing?.role ?? "OPERATOR"}>
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
            </label>
            {editing && (
              <label className="check-field">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked={editing.isActive}
                />
                Активен
              </label>
            )}
          </div>
          <button
            className="primary-button"
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
          />
        </AsyncPanel>
      </article>
    </section>
  );
}
