# DEV-деплой AlowAlow на общем сервере

Сейчас на сервер разворачивается только DEV из ветки `develop`. Production
остаётся выключенным и не занимает каталог, порты, память или базы данных.

## Граница безопасности

На `216.250.11.77` уже работает другой проект. AlowAlow не использует и не
изменяет его каталоги, базы и стандартные публичные порты:

| Ресурс | Другой проект | AlowAlow DEV |
| --- | --- | --- |
| Каталог | существующие `/srv`, `/var/www`, home-каталоги | `/opt/alowalow/development` |
| HTTP/HTTPS | `80`, `443` | HTTPS `8443` |
| React SPA | — | `127.0.0.1:3001` |
| NestJS API | — | `127.0.0.1:4001` |
| PostgreSQL | существующая host-служба | отдельный Docker volume, без host-порта |
| Redis | — | отдельный TLS-контейнер, без host-порта |
| MinIO | — | отдельный Docker volume, без host-порта |
| Compose project | — | `alowalow-development` |

Nginx на `8443` проксирует `/api/v1/*`, `/docs` и `/docs-json` в NestJS, а
остальные запросы — в статический React/Vite SPA-контейнер. Admin собран с
`VITE_API_URL=/api/v1`, поэтому браузер обращается к API через тот же HTTPS
origin. Внутри admin image нет Node.js frontend server: статические файлы
раздаёт непривилегированный Nginx.

Карта админки настраивается во время сборки SPA. `VITE_MAP_TILE_URL` содержит
прямой XYZ-шаблон с `{z}/{x}/{y}`, а подпись слоя задаётся через
`VITE_MAP_ATTRIBUTION`. Для GitHub Actions эти значения задаются как repository
variables; workflow передаёт их в Vite и в сборку статического admin image.
Публичная страница поставщика не показывается в интерфейсе и не используется
как tile endpoint.

TileServer GL и OSRM пока намеренно не добавлены на принятый общий DEV-хост с
2 ГБ RAM: это могло бы повлиять на уже работающий чужой проект. Полный
мобильный стек сейчас поднимается локально командами `npm run maps:up` и
`npm run routing:up`. На новом сервере базовая карта публикуется через HTTPS,
а OSRM остаётся только во внутренней Docker-сети; `ROUTING_URL` API указывает
на `http://routing:5000`. Измеренные значения: около 444 МБ RAM у TileServer
после рендера и около 97 МБ у OSRM, при этом одноразовая подготовка дорожного
графа достигала примерно 558 МБ. Перед включением на DEV/PROD нужно добавить
эти сервисы в изолированный Compose конкретного хоста и повторно проверить
общий запас памяти и диска.

## Веточная схема

```text
feature/* ── pull request ──> develop ── CI ──> GHCR ──> DEV
main ----------------------------------------------------X
                                                        PROD выключен
```

- Pull request в `develop` или `main` запускает проверки без деплоя.
- Merge/push в `develop` публикует три immutable image: API, migration и admin.
- DEV меняется только если repository variable
  `DEVELOPMENT_DEPLOY_ENABLED=true`.
- `PRODUCTION_DEPLOY_ENABLED` остаётся `false`.

Deployment всегда использует image digest, а не moving tag. Миграция должна
успешно завершиться до переключения API. При неуспешном healthcheck скрипт
возвращает предыдущие digest.

## Что проверяет CI

1. Backend lint, build, тесты, coverage и два dependency audit.
2. Admin lint, Sites build/tests и два dependency audit.
3. Swagger → TypeScript contract без незакоммиченного diff.
4. Сборку API, migration и статического React/Nginx admin image.
5. Запуск контейнеров от непривилегированного пользователя и healthcheck.
6. Полную валидацию DEV Compose.

## Ресурсы сервера

На сервере 2 ГБ RAM, нет swap и уже работают Nginx, PostgreSQL, MySQL, PHP и
Gunicorn. Перед запуском DEV обязателен swap минимум 2 ГБ:

```bash
sudo fallocate -l 2G /swapfile-alowalow
sudo chmod 600 /swapfile-alowalow
sudo mkswap /swapfile-alowalow
sudo swapon /swapfile-alowalow
echo '/swapfile-alowalow none swap sw 0 0' | sudo tee -a /etc/fstab
```

Перед добавлением строки следует проверить, что её ещё нет:

```bash
sudo swapon --show
grep -F '/swapfile-alowalow' /etc/fstab
```

DEV-контейнеры имеют жёсткие memory limits. PostgreSQL, Redis и MinIO не
публикуют порты на сервер. Это снижает риск для существующего проекта, но
использование памяти всё равно нужно наблюдать через `docker stats`.

## Одноразовая подготовка DEV

### 1. Docker

Нужны Docker Engine и Compose plugin. После установки:

```bash
sudo usermod -aG docker ubuntu
docker version
docker compose version
```

Новый group membership применяется после повторного SSH-входа.

### 2. Каталог и внутренний TLS Redis

Скопируйте и один раз выполните:

```bash
sudo sh /opt/alowalow/prepare-development-host.sh
```

Скрипт создаёт только `/opt/alowalow/development` и внутренний CA/certificate
для DNS-имени `redis`. Он не читает и не меняет чужие каталоги.

### 3. Runtime secrets

Создайте `/opt/alowalow/development/.env.development` на основе
`deploy/development.env.example`. Права:

```bash
sudo chown ubuntu:ubuntu /opt/alowalow/development/.env.development
sudo chmod 600 /opt/alowalow/development/.env.development
```

Для URL-safe секретов подходят отдельные значения:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

Нельзя повторно использовать один секрет для PostgreSQL, Redis, JWT,
`OTP_PEPPER`, Android device token или MinIO. Настоящие значения не попадают в
Git и GitHub Actions.

Для push-уведомлений DEV runtime также получает отдельный Firebase service
account в `FCM_SERVICE_ACCOUNT_BASE64`. JSON кодируется одной строкой командой
`base64 < firebase-service-account.json | tr -d '\n'`; исходный JSON и base64
не коммитятся и не помещаются в frontend/GitHub build variables. В публичном
DEV/production `PUSH_PROVIDER=fcm`; `console` разрешён только локально.

`CORS_ORIGINS` должен быть ровно:

```text
https://216.250.11.77:8443
```

### 4. GitHub Environment

В Environment `development` нужны:

```text
DEPLOY_SSH_HOST
DEPLOY_SSH_USER
DEPLOY_SSH_PRIVATE_KEY
DEPLOY_SSH_KNOWN_HOSTS
```

Environment variables:

```text
API_PORT=4001
ADMIN_PORT=3001
```

Используется отдельный deploy SSH key. Пароль Ubuntu не сохраняется в GitHub.
Host key должен быть проверен заранее и сохранён целиком в
`DEPLOY_SSH_KNOWN_HOSTS`.

Если GHCR images приватные, сервер один раз авторизуется отдельным GitHub token
только с правом `read:packages`:

```bash
docker login ghcr.io
```

## HTTPS по IP без домена

Геолокация в браузере требует безопасный HTTPS context. DEV поэтому доступен
по `https://216.250.11.77:8443`, а не по открытому HTTP-порту.

Let’s Encrypt выдаёт short-lived IP certificates. Нужен Certbot 5.4 или новее,
webroot challenge и автоматическое продление.

1. Создать отдельный webroot:

   ```bash
   sudo install -d -m 755 /var/lib/alowalow-acme/.well-known/acme-challenge
   ```

2. Положить `deploy/nginx/alowalow-acme-location.conf` в
   `/etc/nginx/snippets/` и добавить один `include` внутрь уже существующего
   raw-IP server block на порту 80. До reload обязательно:

   ```bash
   sudo nginx -t
   ```

3. Сначала проверить staging:

   ```bash
   sudo certbot certonly \
     --staging \
     --preferred-profile shortlived \
     --webroot \
     --webroot-path /var/lib/alowalow-acme \
     --ip-address 216.250.11.77
   ```

4. После успешного staging повторить без `--staging`, затем установить
   `deploy/nginx/alowalow-development.conf` как отдельный site и снова выполнить
   `sudo nginx -t`.

5. Настроить renewal deploy hook с `systemctl reload nginx` и проверить
   `certbot renew --dry-run`. IP certificate живёт шесть дней, поэтому
   автоматическое продление обязательно.

Nginx-конфигурация AlowAlow слушает только `8443`. HSTS намеренно не включён:
IP общий, и политика не должна повлиять на чужой HTTP virtual host.

## Автодеплой

После подготовки сервера и успешной ручной проверки DEV:

```text
DEVELOPMENT_DEPLOY_ENABLED=true
```

Merge в `develop`:

1. прогоняет все проверки;
2. публикует API, migration и admin images в GHCR;
3. передаёт серверу только Compose-файлы и immutable digest-ссылки;
4. запускает `/opt/alowalow/development/deploy-production.sh`;
5. ожидает healthcheck API и статической админки.

Проверка:

```bash
curl --fail https://216.250.11.77:8443/api/v1/health
curl --fail https://216.250.11.77:8443/
curl --fail https://216.250.11.77:8443/docs-json
docker compose \
  --env-file /opt/alowalow/development/.release.env \
  --file /opt/alowalow/development/docker-compose.production.yml \
  --file /opt/alowalow/development/docker-compose.development.yml \
  ps
```

Production на этом сервере не запускается. К ней можно вернуться после
выделения дополнительных ресурсов или отдельного production host.
