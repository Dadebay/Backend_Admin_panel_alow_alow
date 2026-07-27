"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "@/src/shared/auth";

export function OtpLoginCard({
  title = "Вход по телефону",
  description = "Получите одноразовый код по SMS.",
}: {
  title?: string;
  description?: string;
}) {
  const { requestOtp, verifyOtp } = useSession();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      if (!codeRequested) {
        const response = await requestOtp(phone);
        setCodeRequested(true);
        setDevCode(response.devCode ?? "");
      } else {
        await verifyOtp(phone, code);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="otp-card" onSubmit={submit}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <label>
        <span>Номер телефона</span>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+993 65 12 34 56"
          autoComplete="tel"
          disabled={codeRequested || pending}
          required
        />
      </label>
      {codeRequested && (
        <label>
          <span>Код из SMS</span>
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, ""))
            }
            placeholder="000000"
            autoComplete="one-time-code"
            required
          />
        </label>
      )}
      {devCode && (
        <p className="otp-dev-code">
          Локальный SMS-код: <strong>{devCode}</strong>
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending
          ? "Подождите…"
          : codeRequested
            ? "Подтвердить"
            : "Получить код"}
      </button>
      {codeRequested && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setCodeRequested(false);
            setCode("");
            setDevCode("");
            setError("");
          }}
          disabled={pending}
        >
          Изменить номер
        </button>
      )}
    </form>
  );
}
