# ALO Food

Первая рабочая версия платформы доставки еды:

- NestJS 11 API с PostgreSQL и Prisma 7;
- React 19 админка для оператора, кухни, курьера, бухгалтера и администратора;
- Swagger/OpenAPI и генерируемый TypeScript-клиент;
- авторизация по телефону через одноразовый код;
- каталог, категории, изображения, баннеры и промокоды;
- наличная оплата, передача денег курьером и бухгалтерская сверка;
- рейтинг и комментарий клиента после доставки.

## Жизненный цикл заказа

| Этап | Кто выполняет |
| --- | --- |
| `NEW → CONFIRMED → SENT_TO_KITCHEN` | оператор или администратор |
| `SENT_TO_KITCHEN → COOKING → READY` | повар |
| назначение готового заказа курьеру | оператор или администратор |
| `ASSIGNED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED` | назначенный курьер |
| `DELIVERED → CASH_RETURNED` | курьер после передачи наличных оператору |
| `CASH_RETURNED → COMPLETED` | оператор подтверждает сумму |
| `COMPLETED → RECONCILED` | бухгалтер |

Клиент может отменить собственный заказ в статусе `NEW`. Оператор или
администратор может отменить `NEW` и `CONFIRMED`. После передачи на кухню
отмена заблокирована. Ограничения проверяются на сервере, а не только в UI.

У курьера нет ограничения «один активный заказ»: индекс
`courierId + status + assignedAt` позволяет быстро получить все точки и
сформировать маршрут из нескольких доставок.

## Запуск

Требуется Node.js 22.12+ (или 24+) и Docker.

```bash
cp api/.env.example api/.env
docker compose up -d postgres minio minio-init
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

В development ответ `POST /api/v1/auth/otp/request` содержит `devCode`.
В production код в ответ никогда не попадает — вместо этого в
`AuthService.requestOtp` подключается SMS-провайдер.

Тестовые сотрудники после `db:seed`:

| Телефон | Роль |
| --- | --- |
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

## Безопасность

- короткоживущий JWT access token и ротируемый refresh token;
- refresh token хранится в базе только как Argon2-хеш;
- OTP имеет срок 5 минут, лимит попыток и rate limit;
- RBAC и проверка владельца/назначенного сотрудника на каждом переходе;
- оптимистическая блокировка заказа через поле `version`;
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
`OTP_PEPPER` длиной не менее 32 символов, подключить SMS-провайдера и
провайдера маршрутов/карт для расчёта реального ETA.
