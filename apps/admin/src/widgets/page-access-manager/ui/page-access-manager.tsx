import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  adminPageLabels,
  useAdminPageAccessMatrix,
  type AdminUserPageAccess,
} from "@/src/entities/admin-page-access";
import { roleLabels, type Role } from "@/src/entities/order";
import { useAdminPageAccessActions } from "@/src/features/admin-page-access";
import { AsyncPanel } from "@/src/shared/ui";
import {
  pageAccessFormSchema,
  type PageAccessFormInput,
  type PageAccessFormValues,
} from "../model/page-access-form";

const ALL_ROLES = "ALL";

function mutationMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось сохранить доступ";
}

function employeeName(access: AdminUserPageAccess) {
  return (
    [access.firstName, access.lastName].filter(Boolean).join(" ") || access.phone
  );
}

function UserAccessForm({
  access,
  onSaved,
}: {
  access: AdminUserPageAccess;
  onSaved: (name: string) => void;
}) {
  const actions = useAdminPageAccessActions();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<PageAccessFormInput, unknown, PageAccessFormValues>({
    resolver: zodResolver(pageAccessFormSchema),
    defaultValues: {
      allowedPages: access.allowedPages,
      version: access.version,
    },
  });
  const selectedPages = useWatch({ control, name: "allowedPages" });
  const name = employeeName(access);

  async function submit(values: PageAccessFormValues) {
    const saved = await actions.updateUserAccess.mutateAsync({
      userId: access.userId,
      body: values,
    });
    reset({ allowedPages: saved.allowedPages, version: saved.version });
    onSaved(name);
  }

  if (!access.editable) {
    return (
      <article
        className="editor-card page-access-role-card is-locked"
        data-testid={`page-access-user-${access.userId}`}
      >
        <div className="page-access-role-head">
          <div>
            <h2>{name}</h2>
            <p>
              {access.phone} · {roleLabels[access.role]}
            </p>
          </div>
          <span className="page-access-badge">Полный доступ защищён</span>
        </div>
        <div className="page-access-grid">
          {access.availablePages.map((page) => (
            <div className="page-access-option is-checked is-disabled" key={page}>
              <span aria-hidden="true">✓</span>
              <strong>{adminPageLabels[page]}</strong>
            </div>
          ))}
        </div>
      </article>
    );
  }

  return (
    <form
      className="editor-card page-access-role-card"
      data-testid={`page-access-user-${access.userId}`}
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <input type="hidden" {...register("version", { valueAsNumber: true })} />
      <div className="page-access-role-head">
        <div>
          <h2>{name}</h2>
          <p>
            {access.phone} · {roleLabels[access.role]}
            {!access.isActive && " · аккаунт отключён"}
          </p>
        </div>
        <span className="page-access-badge">
          {selectedPages.length} из {access.availablePages.length}
        </span>
      </div>

      <fieldset className="page-access-fieldset">
        <legend className="sr-only">Страницы сотрудника {name}</legend>
        <div className="page-access-grid">
          {access.availablePages.map((page) => (
            <label className="page-access-option" key={page}>
              <input
                type="checkbox"
                value={page}
                data-testid={`page-access-toggle-${access.userId}-${page.toLowerCase()}`}
                disabled={actions.updateUserAccess.isPending}
                {...register("allowedPages")}
              />
              <span aria-hidden="true" />
              <strong>{adminPageLabels[page]}</strong>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="page-access-actions">
        <button
          className="primary-button"
          data-testid={`page-access-save-${access.userId}`}
          type="submit"
          disabled={!isDirty || actions.updateUserAccess.isPending}
        >
          {actions.updateUserAccess.isPending
            ? "Сохраняем…"
            : "Сохранить доступ"}
        </button>
        {actions.updateUserAccess.isError && (
          <span className="form-error" role="alert">
            {mutationMessage(actions.updateUserAccess.error)}
          </span>
        )}
      </div>
    </form>
  );
}

export function PageAccessManager() {
  const matrix = useAdminPageAccessMatrix();
  const [savedUser, setSavedUser] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | typeof ALL_ROLES>(ALL_ROLES);
  const users = useMemo(() => matrix.data?.users ?? [], [matrix.data?.users]);
  const visibleUsers = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ru");
    return users.filter((user) => {
      if (role !== ALL_ROLES && user.role !== role) return false;
      if (!normalized) return true;
      return [user.firstName, user.lastName, user.phone, roleLabels[user.role]]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(normalized);
    });
  }, [role, search, users]);
  const availableRoles = useMemo(
    () => Array.from(new Set(users.map((user) => user.role))),
    [users],
  );

  return (
    <section className="admin-section page-access-manager" data-testid="page-access-manager">
      <header className="section-head">
        <div>
          <h1>Доступ сотрудников</h1>
          <p>
            Главный администратор отдельно выбирает страницы для каждого
            сотрудника — независимо от его роли.
          </p>
        </div>
      </header>

      <div className="page-access-notice">
        Выданная страница открывает сотруднику вход в админку и защищённые API
        этой страницы. Права SUPER_ADMIN изменить нельзя.
      </div>

      <div className="page-access-filters">
        <label>
          <span className="sr-only">Поиск сотрудника</span>
          <input
            className="text-input"
            data-testid="page-access-search"
            type="search"
            placeholder="Имя или телефон"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Фильтр по роли</span>
          <select
            className="select-input"
            data-testid="page-access-role-filter"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as Role | typeof ALL_ROLES)
            }
          >
            <option value={ALL_ROLES}>Все роли</option>
            {availableRoles.map((value) => (
              <option key={value} value={value}>
                {roleLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {savedUser && (
        <div className="inline-success" role="status">
          Доступ сотрудника «{savedUser}» обновлён.
        </div>
      )}

      <AsyncPanel
        pending={matrix.isPending}
        error={matrix.error}
        onRetry={() => void matrix.refetch()}
      >
        {visibleUsers.length === 0 ? (
          <div className="empty-state" data-testid="page-access-empty">
            Сотрудники не найдены.
          </div>
        ) : (
          <div className="page-access-role-list">
            {visibleUsers.map((access) => (
              <UserAccessForm
                access={access}
                key={`${access.userId}:${access.version}`}
                onSaved={setSavedUser}
              />
            ))}
          </div>
        )}
      </AsyncPanel>
    </section>
  );
}
