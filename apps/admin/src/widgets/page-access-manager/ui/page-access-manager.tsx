import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  adminPageLabels,
  adminPageValues,
  useAdminPageAccessMatrix,
  type AdminRolePageAccess,
} from "@/src/entities/admin-page-access";
import { roleLabels } from "@/src/entities/order";
import type { Role } from "@/src/entities/order";
import { useAdminPageAccessActions } from "@/src/features/admin-page-access";
import { AsyncPanel } from "@/src/shared/ui";
import {
  pageAccessFormSchema,
  type PageAccessFormInput,
  type PageAccessFormValues,
} from "../model/page-access-form";

function mutationMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось сохранить доступ";
}

function RoleAccessForm({
  access,
  onSaved,
}: {
  access: AdminRolePageAccess;
  onSaved: (role: Role) => void;
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
  const selectedPages = useWatch({
    control,
    name: "allowedPages",
  });

  async function submit(values: PageAccessFormValues) {
    const saved = await actions.updateRoleAccess.mutateAsync({
      role: access.role,
      body: values,
    });
    reset({ allowedPages: saved.allowedPages, version: saved.version });
    onSaved(access.role);
  }

  if (!access.editable) {
    return (
      <article className="editor-card page-access-role-card is-locked">
        <div className="page-access-role-head">
          <div>
            <h2>{roleLabels[access.role]}</h2>
            <p>Полный доступ защищён и не может быть отключён.</p>
          </div>
          <span className="page-access-badge">Всегда разрешено</span>
        </div>
        <div className="page-access-grid">
          {adminPageValues.map((page) => (
            <div className="page-access-option is-checked is-disabled" key={page}>
              <span aria-hidden="true">✓</span>
              <strong>{adminPageLabels[page]}</strong>
            </div>
          ))}
        </div>
      </article>
    );
  }

  const available = new Set(access.availablePages);
  return (
    <form
      className="editor-card page-access-role-card"
      data-testid={`page-access-form-${access.role.toLowerCase()}`}
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <input type="hidden" {...register("version", { valueAsNumber: true })} />
      <div className="page-access-role-head">
        <div>
          <h2>{roleLabels[access.role]}</h2>
          <p>
            Можно отключить только страницы, уже поддерживаемые полномочиями
            этой роли.
          </p>
        </div>
        <span className="page-access-badge">
          {selectedPages.length} из {access.availablePages.length}
        </span>
      </div>

      <fieldset className="page-access-fieldset">
        <legend className="sr-only">Страницы роли {roleLabels[access.role]}</legend>
        <div className="page-access-grid">
          {adminPageValues.map((page) => {
            const canUsePage = available.has(page);
            return (
              <label
                className={`page-access-option ${canUsePage ? "" : "is-disabled"}`}
                key={page}
              >
                <input
                  type="checkbox"
                  value={page}
                  data-testid={`page-access-toggle-${access.role.toLowerCase()}-${page.toLowerCase()}`}
                  disabled={!canUsePage || actions.updateRoleAccess.isPending}
                  {...register("allowedPages")}
                />
                <span aria-hidden="true" />
                <strong>{adminPageLabels[page]}</strong>
                {!canUsePage && <small>Не поддерживается ролью</small>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="page-access-actions">
        <button
          className="primary-button"
          data-testid={`page-access-save-${access.role.toLowerCase()}`}
          type="submit"
          disabled={!isDirty || actions.updateRoleAccess.isPending}
        >
          {actions.updateRoleAccess.isPending ? "Сохраняем…" : "Сохранить доступ"}
        </button>
        {actions.updateRoleAccess.isError && (
          <span className="form-error" role="alert">
            {mutationMessage(actions.updateRoleAccess.error)}
          </span>
        )}
      </div>
    </form>
  );
}

export function PageAccessManager() {
  const matrix = useAdminPageAccessMatrix();
  const [savedRole, setSavedRole] = useState<Role | null>(null);

  return (
    <section className="admin-section page-access-manager" data-testid="page-access-manager">
      <header className="section-head">
        <div>
          <h1>Доступ к страницам</h1>
          <p>
            Управляйте видимостью и прямым входом в разделы для каждой
            веб-роли. Права на API и действия остаются защищены сервером.
          </p>
        </div>
      </header>

      <div className="page-access-notice">
        Изменения применяются ко всем сотрудникам выбранной роли. Открытые в
        другом браузере сессии получат новую матрицу при следующем обновлении.
      </div>

      {savedRole && (
        <div className="inline-success" role="status">
          Доступ для роли «{roleLabels[savedRole]}» обновлён.
        </div>
      )}

      <AsyncPanel
        pending={matrix.isPending}
        error={matrix.error}
        onRetry={() => void matrix.refetch()}
      >
        <div className="page-access-role-list">
          {matrix.data?.roles.map((access) => (
            <RoleAccessForm
              access={access}
              key={`${access.role}:${access.version}`}
              onSaved={setSavedRole}
            />
          ))}
        </div>
      </AsyncPanel>
    </section>
  );
}
