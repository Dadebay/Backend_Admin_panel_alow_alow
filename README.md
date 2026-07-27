# AlowAlow

Первая рабочая версия платформы доставки еды:

- NestJS 11 API с PostgreSQL и Prisma 7;
- Redis 8 для одноразовых кодов и защиты от повторной отправки;
- React 19 админка для оператора, кухни, курьера, бухгалтера, администратора
  и главного администратора;
- Swagger/OpenAPI и генерируемый TypeScript-клиент;
- авторизация по телефону через одноразовый код;
- несколько адресов клиента с автоматическим выбором последнего созданного
  или использованного в заказе;
- каталог, категории, изображения, баннеры и промокоды;
- наличная оплата, передача денег курьером и бухгалтерская сверка;
- рейтинг и комментарий клиента после доставки.

## Жизненный цикл заказа

| Этап | Кто выполняет |
| --- | --- |
| `NEW → CONFIRMED → SENT_TO_KITCHEN` | оператор, администратор или главный администратор |
| `SENT_TO_KITCHEN → COOKING → READY` | повар |
| назначение готового заказа курьеру | оператор или администратор |
| `ASSIGNED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED` | назначенный курьер |
| `DELIVERED → CASH_RETURNED` | курьер после передачи наличных оператору |
| `CASH_RETURNED → COMPLETED` | оператор подтверждает сумму |
| `COMPLETED → RECONCILED` | бухгалтер |

Клиент может отменить собственный заказ только в статусе `NEW`. Оператор,
администратор или главный администратор может отменить `NEW`, `CONFIRMED`
и `SENT_TO_KITCHEN`, пока повар не перевёл заказ в `COOKING`. После начала
приготовления отмена заблокирована. Ограничения проверяются на сервере,
а не только в UI.

У курьера нет ограничения «один активный заказ»: индекс
`courierId + status + assignedAt` позволяет быстро получить все точки и
сформировать маршрут из нескольких доставок.

## Запуск

Требуется Node.js 22.13+ LTS (или 24+) и Docker.

```bash
cp api/.env.example api/.env
docker compose up -d postgres redis minio minio-init
npm install
npm --prefix api install
npm --prefix api run prisma:generate
npm --prefix api run db:migrate -- --name init
npm --prefix api run db:seed
npm run stack:dev
```

- Админка: `http://localhost:3000` (или следующий свободный порт)
- API: `http://localhost:4000/api/v1`
- Swagger: `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs-json`
- MinIO Console: `http://localhost:9001` (`alofood` / `alofood-local-secret`)

В development при `SMS_PROVIDER=console` ответ
`POST /api/v1/auth/otp/request` содержит `devCode`. В production код в ответ
никогда не попадает: он хранится в Redis 5 минут и отправляется через Twilio.
Повторная отправка на номер доступна через 60 секунд, действует лимит 5 SMS в
час и 5 попыток ввода. Успешно использованный код атомарно удаляется.

Для реальной отправки SMS задайте:

```dotenv
REDIS_URL=rediss://user:password@redis.example.com:6379/0
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+12025550123
```

`TWILIO_FROM` должен быть разрешённым Twilio-номером или Sender ID. Для
Туркменистана доступна исходящая отправка, но местный оператор может заменить
отображаемого отправителя.

Адреса клиента доступны через `/api/v1/users/me/addresses`. Новый адрес
становится активным автоматически. Если заказ создаётся с `addressId`, этот
адрес становится активным, а в самом заказе сохраняется неизменяемый снимок
адреса на момент оформления. Если адрес не передан при создании заказа, API
использует текущий активный адрес.

Тестовые сотрудники после `db:seed`:

| Телефон | Роль |
| --- | --- |
| `+99365000000` | главный администратор |
| `+99365000001` | администратор |
| `+99365000002` | оператор |
| `+99365000003` | повар |
| `+99365000004` | курьер |
| `+99365000005` | бухгалтер |

## Основные команды

```bash
npm run dev                 # React-админка
npm run api:dev             # NestJS API
npm run stack:dev           # оба приложения
npm run api:client          # Swagger JSON → app/lib/api-schema.ts
npm test                    # production build + UI smoke test
npm run api:build
npm run api:test
```

`npm run api:test` создаёт отдельную базу `alofood_test`, использует Redis DB
15, накатывает все миграции, выполняет unit- и HTTP e2e-тесты с отчётом
покрытия, а затем очищает тестовые хранилища. PostgreSQL, Redis и MinIO должны
быть запущены через Docker; рабочая база `alofood` и Redis DB 0 тестами не
изменяются. В CI действуют минимальные пороги покрытия: 75% statements,
60% branches, 80% functions и 78% lines.

## Безопасность

- короткоживущий JWT access token и ротируемый refresh token;
- OTP и refresh token защищены от повторного и параллельного использования;
- refresh token хранится в базе только как Argon2-хеш;
- OTP хранится в Redis как HMAC, имеет TTL 5 минут, лимит попыток, cooldown,
  почасовой лимит и атомарное одноразовое потребление;
- RBAC и проверка владельца/назначенного сотрудника на каждом переходе;
- оптимистическая блокировка заказа через поле `version`;
- production не запускается с dev-секретами, wildcard CORS или без базы;
- расчёт цены и скидки выполняется только сервером;
- DTO whitelist, запрет неизвестных полей, Helmet и ограниченный CORS;
- изображения проверяются, перекодируются в WebP и сохраняются под случайным
  именем в приватном S3 bucket;
- все переходы заказа и критичные действия сохраняются в журнале.

Локально S3 API предоставляет MinIO. Для AWS S3 в production задайте
`S3_REGION` и `S3_BUCKET`, оставьте `S3_ENDPOINT` пустым и
`S3_FORCE_PATH_STYLE=false`. `S3_ACCESS_KEY_ID` и
`S3_SECRET_ACCESS_KEY` можно не задавать при использовании IAM-роли.

Перед production также необходимо задать случайные `JWT_ACCESS_SECRET` и
`OTP_PEPPER` длиной не менее 32 символов, TLS-адрес `REDIS_URL`, параметры
Twilio и провайдера маршрутов/карт для расчёта реального ETA.
