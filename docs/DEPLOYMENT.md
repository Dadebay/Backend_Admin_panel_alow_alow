# CI/CD и автоматический DEV/PROD-деплой

## Веточная схема

```text
feature/* ──pull request──> develop ──автодеплой──> DEV
                              │
                              └──pull request──> main ──подтверждение──> PROD
```

- Pull request в `develop` или `main` запускает только CI-проверки.
- Push/merge в `develop` после успешного CI публикует immutable Docker images
  и автоматически обновляет DEV.
- Push/merge в `main` после успешного CI публикует те же типы images и обновляет
  PROD через защищённый GitHub Environment `production`.
- `workflow_dispatch` позволяет повторить деплой вручную. Для DEV workflow
  запускается с ветки `develop`, для PROD — с ветки `main`.
- Feature-ветка никогда напрямую не деплоится.

Не нужно переносить один и тот же commit вручную на сервер. Источником релиза
является merge commit в соответствующей ветке.

## Что проверяет CI

Перед любым деплоем workflow обязан успешно выполнить:

1. Backend lint, build, 34+ unit/e2e/security tests и coverage.
2. Полный и production dependency audit backend.
3. Admin lint, production build, tests и dependency audit.
4. Перегенерацию Swagger и TypeScript-контракта без незакоммиченного diff.
5. Сборку runtime- и migration-контейнеров.
6. Проверку непривилегированного пользователя и Docker healthcheck.
7. Валидацию Compose отдельно для DEV и PROD.

Если хотя бы один шаг упал, image не публикуется и сервер не меняется.

## Изоляция окружений

DEV и PROD могут работать на одном Linux-сервере, но используют разные:

| Ресурс              | DEV                      | PROD                    |
| ------------------- | ------------------------ | ----------------------- |
| Ветка               | `develop`                | `main`                  |
| GitHub Environment  | `development`            | `production`            |
| Каталог сервера     | `~/alowalow-development` | `~/alowalow`            |
| Compose project     | `alowalow-development`   | `alowalow-production`   |
| Локальный API-порт  | `4001`                   | `4000`                  |
| Runtime env         | `.env.development`       | `.env.production`       |
| PostgreSQL          | отдельная DEV-база       | отдельная PROD-база     |
| Redis               | отдельная база/instance  | отдельная база/instance |
| S3                  | отдельный bucket         | отдельный bucket        |
| JWT/OTP/SMS secrets | отдельные                | отдельные               |

DEV и PROD никогда не должны использовать одну PostgreSQL-базу, один S3 bucket
или одинаковые секреты. Deployed DEV по умолчанию также использует
`NODE_ENV=production`, чтобы не возвращать `devCode` через публичный API.

## Настройка GitHub

### 1. Ветки

Создайте `develop` от текущего `main`:

```bash
git switch main
git pull --ff-only
git switch -c develop
git push -u origin develop
```

В GitHub Branch protection/rulesets рекомендуется:

- запретить прямой push в `main`;
- разрешить изменения `main` только через pull request из `develop`/hotfix;
- требовать успешные jobs `Backend quality`, `Admin quality`,
  `Swagger contract` и `Production containers`;
- запретить merge при устаревшей ветке;
- запретить force push и удаление `main`/`develop`.

### 2. GitHub Environments

Создайте Environments:

- `development` — без ручного подтверждения;
- `production` — с required reviewer и, по возможности, deployment branch
  только `main`.

В каждом Environment добавьте одинаково названные, но разные по значению
secrets:

```text
DEPLOY_SSH_HOST
DEPLOY_SSH_USER
DEPLOY_SSH_PRIVATE_KEY
DEPLOY_SSH_KNOWN_HOSTS
```

`DEPLOY_SSH_KNOWN_HOSTS` должен содержать заранее проверенный host key сервера,
а не результат слепого доверия во время workflow.

Environment variable:

```text
API_PORT=4001  # development
API_PORT=4000  # production
```

Repository variables, включающие фактический автодеплой:

```text
DEVELOPMENT_DEPLOY_ENABLED=true
PRODUCTION_DEPLOY_ENABLED=true
```

Пока сервер не подготовлен, оставьте соответствующую переменную выключенной.
CI и публикация images продолжат работать без SSH-деплоя.

## Подготовка сервера

На сервере должны быть Docker Engine и Docker Compose plugin. Для deploy-user:

```bash
mkdir -p ~/alowalow-development ~/alowalow
chmod 700 ~/alowalow-development ~/alowalow
```

Создайте runtime-конфигурации из примеров:

```text
~/alowalow-development/.env.development
~/alowalow/.env.production
```

- DEV-шаблон: `deploy/development.env.example`.
- PROD-шаблон: `deploy/production.env.example`.

Файлы должны принадлежать deploy-user и иметь права `600`:

```bash
chmod 600 ~/alowalow-development/.env.development
chmod 600 ~/alowalow/.env.production
```

Настоящие значения секретов никогда не копируются в GitHub workflow и Git.
Они постоянно хранятся только на сервере.

Если GHCR package приватный, один раз авторизуйте сервер с отдельным GitHub PAT,
имеющим только `read:packages`:

```bash
docker login ghcr.io
```

## Reverse proxy и домены

Контейнеры публикуются только на loopback-интерфейсе:

```text
127.0.0.1:4001 → DEV API
127.0.0.1:4000 → PROD API
```

Caddy/Nginx должен завершать HTTPS и проксировать разные домены, например:

```text
api-dev.example.com → 127.0.0.1:4001
api.example.com     → 127.0.0.1:4000
```

Эти frontend-домены нужно отдельно указать в `CORS_ORIGINS` соответствующего
runtime env-файла.

## Как проходит релиз

1. GitHub Actions собирает два образа:
   `api` и `migration`.
2. Оба публикуются в GHCR с `sha-<commit>` и environment-тегом.
3. На сервер передаются только digest-ссылки на проверенные images.
4. `prisma migrate deploy` выполняется до запуска нового API.
5. Новый API должен пройти Docker healthcheck.
6. Только после этого deployment считается успешным.
7. При неуспешном запуске скрипт возвращает предыдущие image digest и снова
   поднимает прошлую версию API.

Moving-теги `development`, `production` и `latest` существуют для удобства,
но deployment всегда использует immutable digest.

## Админка

CI собирает проверенный artifact админки отдельно для `develop` и `main`.
Существующий приватный frontend размещён в Sites и не получает SSH-деплой
backend workflow. Для полностью автоматических DEV/PROD-preview админки нужны
два отдельных hosting target либо провайдер с branch deployments. Backend URL
для каждой сборки задаётся через `NEXT_PUBLIC_API_URL` соответствующего hosting
окружения.
