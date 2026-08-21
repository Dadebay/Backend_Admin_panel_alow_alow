import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useContactSettings } from "@/src/entities/contact";
import { useContactSettingsActions } from "@/src/features/contact-settings";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel } from "@/src/shared/ui";
import {
  contactFormSchema,
  type ContactFormInput,
  type ContactFormValues,
} from "../model/contact-form";

export function ContactManager() {
  const contactSettings = useContactSettings();
  const actions = useContactSettingsActions();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ContactFormInput, unknown, ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    mode: "onBlur",
    defaultValues: {
      displayName: "",
      phone: "",
      telegram: "",
      email: "",
      privacyLink: "",
      userAgreementLink: "",
    },
  });

  useEffect(() => {
    const value = contactSettings.data;
    if (!value || isDirty) return;
    reset({
      displayName: value.displayName,
      phone: value.phone,
      telegram: value.telegram ?? "",
      email: value.email ?? "",
      privacyLink: value.privacyLink ?? "",
      userAgreementLink: value.userAgreementLink ?? "",
    });
  }, [contactSettings.data, isDirty, reset]);

  async function submit(values: ContactFormValues) {
    await actions.updateContactSettings.mutateAsync(values);
    reset(values);
  }

  return (
    <section className="admin-section" data-testid="contact-manager">
      <header className="section-head" data-testid="contact-header">
        <div>
          <span className="eyebrow">CONTACT US</span>
          <h1>Контакты</h1>
          <p>
            Укажите контакты, которые увидят клиенты в приложении и на странице
            поддержки.
          </p>
        </div>
      </header>

      <AsyncPanel
        pending={contactSettings.isPending}
        error={contactSettings.error}
        onRetry={() => void contactSettings.refetch()}
      >
        {contactSettings.data && (
          <form
            className="editor-card contact-editor"
            data-testid="contact-settings-form"
            noValidate
            onSubmit={handleSubmit(submit)}
          >
            <div className="editor-title">
              <div>
                <h2>Данные для связи</h2>
                <p>Телефон и название обязательны. Остальные поля можно оставить пустыми.</p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Название поддержки
                <input
                  data-testid="contact-display-name"
                  {...register("displayName")}
                  autoComplete="organization"
                />
                <FormFieldError message={errors.displayName?.message} />
              </label>
              <label>
                Телефон
                <input
                  data-testid="contact-phone"
                  {...register("phone")}
                  autoComplete="tel"
                  inputMode="tel"
                />
                <FormFieldError message={errors.phone?.message} />
              </label>
              <label>
                Telegram
                <input
                  data-testid="contact-telegram"
                  {...register("telegram")}
                  placeholder="@alowalow"
                />
                <FormFieldError message={errors.telegram?.message} />
              </label>
              <label>
                Email
                <input
                  data-testid="contact-email"
                  {...register("email")}
                  autoComplete="email"
                  inputMode="email"
                />
                <FormFieldError message={errors.email?.message} />
              </label>
              <label>
                Ссылка на политику конфиденциальности
                <input
                  data-testid="contact-privacy-link"
                  {...register("privacyLink")}
                  inputMode="url"
                  placeholder="https://…"
                />
                <FormFieldError message={errors.privacyLink?.message} />
              </label>
              <label>
                Ссылка на пользовательское соглашение
                <input
                  data-testid="contact-user-agreement-link"
                  {...register("userAgreementLink")}
                  inputMode="url"
                  placeholder="https://…"
                />
                <FormFieldError message={errors.userAgreementLink?.message} />
              </label>
            </div>
            {actions.updateContactSettings.error && (
              <div className="inline-alert" role="alert">
                {actions.updateContactSettings.error instanceof Error
                  ? actions.updateContactSettings.error.message
                  : "Не удалось сохранить контакты."}
              </div>
            )}
            {actions.updateContactSettings.isSuccess && (
              <div className="inline-success" role="status">
                Контакты сохранены.
              </div>
            )}
            <button
              className="primary-button"
              data-testid="contact-save"
              disabled={actions.updateContactSettings.isPending || !isDirty}
              type="submit"
            >
              {actions.updateContactSettings.isPending ? "Сохраняем…" : "Сохранить контакты"}
            </button>
          </form>
        )}
      </AsyncPanel>
    </section>
  );
}
