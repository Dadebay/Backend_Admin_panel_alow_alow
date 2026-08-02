# Push-уведомления AlowAlow для Android

Firebase Cloud Messaging используется только как канал доставки push. Вход по
телефону, OTP, JWT, пользователи и роли остаются в NestJS/PostgreSQL AlowAlow.
Мобильное приложение не должно содержать service account или серверный FCM
секрет.

## Что делает мобильное приложение

1. Подключает Firebase Cloud Messaging SDK к Android-приложению и запрашивает
   разрешение `POST_NOTIFICATIONS` на Android 13+.
2. Включает актуальную регистрацию по Firebase Installation ID (FID) и
   обрабатывает `FirebaseMessagingService.onRegistered(fid)`.
3. После входа клиента отправляет FID в AlowAlow с его JWT:

   ```http
   PUT /api/v1/notifications/devices
   Authorization: Bearer <customer-access-token>
   Content-Type: application/json

   {
     "installationId": "<firebase-installation-id>",
     "platform": "ANDROID",
     "appVersion": "1.0.0",
     "locale": "ru-TM"
   }
   ```

   Повторный `PUT` безопасен: backend обновляет владельца, версию приложения,
   язык и время последней регистрации. Новый FID после переустановки или
   ротации надо передать тем же способом.

4. Создаёт notification channel с ID `alowalow_general` до получения первого
   сообщения.
5. В `onMessageReceived` читает стандартные `title`/`body` и data-поля:

   | Поле | Назначение |
   | --- | --- |
   | `campaignId` | ID административной рассылки |
   | `notificationId` | ID записи в inbox конкретного клиента |
   | `deepLink` | необязательный внутренний путь, например `/orders/current` |

   `notificationId` надо использовать для дедупликации: очередь имеет
   гарантию доставки «как минимум один раз», поэтому после сбоя worker может
   безопасно повторить одно сообщение. `deepLink` открывается только через
   allowlist маршрутов самого приложения, а не как произвольный web URL.

6. Перед выходом из аккаунта деактивирует установку, пока JWT ещё доступен:

   ```http
   DELETE /api/v1/notifications/devices/<firebase-installation-id>
   Authorization: Bearer <customer-access-token>
   ```

## Inbox в приложении

Push не является единственным источником: backend сохраняет уведомление для
каждого активного клиента в PostgreSQL. Поэтому экран уведомлений восстанавливает
историю даже после отключённого интернета или запрещённых push-разрешений.

```text
GET   /api/v1/notifications/me?page=1&limit=25
GET   /api/v1/notifications/me/unread-count
PATCH /api/v1/notifications/me/<notificationId>/read
POST  /api/v1/notifications/me/read-all
```

Все четыре endpoint принимают только JWT роли `CUSTOMER` и никогда не
возвращают inbox другого пользователя.

## Что настраивается только на backend

Администратор Firebase создаёт отдельный Firebase project/app для AlowAlow и
выдаёт серверный service-account JSON. На локальной/серверной машине JSON
преобразуется в одну base64-строку:

```bash
base64 < firebase-service-account.json | tr -d '\n'
```

Значение сохраняется только в защищённом runtime `.env`:

```dotenv
PUSH_PROVIDER=fcm
FCM_SERVICE_ACCOUNT_BASE64=<base64 без переносов>
PUSH_DISPATCH_INTERVAL_MS=5000
```

В обычной локальной разработке используется `PUSH_PROVIDER=console`: кампания,
inbox, роли и история работают, но реальный телефон push не получает. Для
проверки настоящего устройства локально временно включается `fcm` и задаётся
локальный секрет; сам JSON и его base64 никогда не коммитятся.

## Административный flow

Только `ADMIN` и `SUPER_ADMIN` создают кампанию через раздел «Уведомления» или
`POST /api/v1/notifications/admin/campaigns`. Backend создаёт inbox всем
активным клиентам, создаёт delivery-запись для каждого активного устройства,
отправляет FCM пакетами до 500 сообщений и сохраняет итог `SENT`, `PARTIAL` или
`FAILED`. Ошибочный/частичный запуск можно повторить из админки. Каждое создание,
повтор и завершение записывается в audit log.

Официальная документация: [Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started),
[FirebaseMessagingService](https://firebase.google.com/docs/reference/android/com/google/firebase/messaging/FirebaseMessagingService),
[server environment](https://firebase.google.com/docs/cloud-messaging/server-environment).
