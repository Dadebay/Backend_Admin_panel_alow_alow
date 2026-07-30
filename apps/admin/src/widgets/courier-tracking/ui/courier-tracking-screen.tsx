import { CourierLocationSharing } from "@/src/features/courier-location-sharing";
import { OtpLoginCard } from "@/src/features/otp-login";
import { useSession } from "@/src/shared/auth";

export function CourierTrackingScreen() {
  const { session, ready, logout } = useSession();

  if (!ready) {
    return (
      <main className="courier-screen" data-testid="courier-session-loading">
        Проверяем сессию…
      </main>
    );
  }

  return (
    <main className="courier-screen" data-testid="courier-screen">
      <header className="courier-screen-head">
        <a className="brand" data-testid="courier-home-link" href="/">
          <span className="brand-mark">A</span>
          <span>
            <strong>AlowAlow</strong>
            <small>courier</small>
          </span>
        </a>
        {session && (
          <button className="text-button" onClick={() => void logout()}>
            Выйти
          </button>
        )}
      </header>
      {!session ? (
        <OtpLoginCard
          title="Вход курьера"
          description="Авторизуйтесь по рабочему номеру телефона."
        />
      ) : session.user.role !== "COURIER" ? (
        <section className="courier-sharing-card">
          <h1>Это экран курьера</h1>
          <p>
            Текущая роль — {session.user.role}. Передавать GPS может только
            сотрудник с ролью COURIER.
          </p>
          <a
            className="secondary-button"
            data-testid="courier-back-admin"
            href="/"
          >
            Вернуться в админку
          </a>
        </section>
      ) : (
        <>
          <div className="courier-welcome">
            <span>Смена доставки</span>
            <h1>
              {session.user.firstName
                ? `Здравствуйте, ${session.user.firstName}`
                : "Здравствуйте"}
            </h1>
            <p>
              Включите геолокацию, чтобы оператор видел ваше положение и
              маршруты активных заказов.
            </p>
          </div>
          <CourierLocationSharing />
        </>
      )}
    </main>
  );
}
