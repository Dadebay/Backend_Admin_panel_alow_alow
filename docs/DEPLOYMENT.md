# DEV-деплой A7-tagam на выделенном VDS

На `216.250.12.132` разворачивается один полный тестовый стенд из ветки
`main`. Приложения собираются и работают в production mode, но сам VDS остаётся
единственным тестовым окружением до появления отдельного production-сервера.
Сервер имеет 4 vCPU, 4 ГБ RAM и 60 ГБ SSD.

## Граница безопасности

Все данные и процессы изолированы внутри одного каталога и Compose project:

| Ресурс | A7-tagam DEV |
| --- | --- |
| Каталог | `/opt/alowalow/development` |
| HTTP/HTTPS | `80` для ACME/redirect, приложение на `443` |
| React SPA | `127.0.0.1:3001` |
| NestJS API | `127.0.0.1:4001` |
| Карта | `127.0.0.1:8080`, наружу только через `/tiles/` |
| OSRM | только Docker-сеть, без host-порта |
| PostgreSQL | отдельный Docker volume, без host-порта |
| Redis | отдельный TLS-контейнер, без host-порта |
| MinIO | отдельный Docker volume, без host-порта |
| Compose project | `alowalow-development` |

Nginx на `443` проксирует `/api/v1/*`, `/docs` и `/docs-json` в NestJS, а
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

TileServer GL и OSRM входят в DEV Compose. Базовая карта публикуется через
`/tiles/`, а OSRM остаётся только во внутренней Docker-сети;
`ROUTING_URL=http://routing:5000`. Подготовленные данные Turkmenistan занимают
около 350 МБ. Измеренные значения: около 444 МБ RAM у TileServer после рендера
и около 97 МБ у OSRM; одноразовая подготовка дорожного графа достигала примерно
558 МБ. Runtime-данные передаются на сервер один раз и не включаются в Git или
Docker images.

## Веточная схема

```text
feature/* ── pull request ──> main ── CI ──> GHCR ──> test VDS
```

- Pull request в `main` запускает проверки без деплоя.
- Merge/push в `main` публикует три immutable image: API, migration и admin.
- DEV меняется только если repository variable
  `DEVELOPMENT_DEPLOY_ENABLED=true`.
- Отдельная `develop`-ветка пока не используется. Она будет введена вместе со
  вторым окружением после текущего клиентского тестирования.
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

На сети VDS доступны Ubuntu APT, GitHub, GHCR и внутренний Telecom Nexus, но
недоступны публичные Docker Hub, PyPI и Snap CDN. Pinned PostgreSQL, Redis,
MinIO, MinIO Client и TileServer GL скачиваются через стандартный анонимный
Docker endpoint `nexus.telecom.tm`; digest остаётся тем же и проверяется Docker.
Наши API/migration/admin images скачиваются из GHCR. Короткоживущий
`GITHUB_TOKEN` передаётся Docker Login через SSH stdin только на время деплоя и
затем удаляется командой `docker logout`; постоянный registry token на VDS не
хранится. Nexus npm proxy доступен по
`https://nexus.telecom.tm/repository/npm-proxy/`, но сервер не выполняет
`npm install`, поскольку Node.js-сборки происходят только в GitHub Actions.

## Ресурсы сервера

На сервере 4 ГБ RAM. Перед запуском полного DEV рекомендуется swap 2 ГБ, чтобы
одноразовая подготовка, обновление images или краткий пик TileServer не привели
к OOM:

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

DEV-контейнеры имеют жёсткие memory limits. PostgreSQL, Redis, MinIO и OSRM не
публикуют порты на сервер. TileServer доступен только на loopback. Использование
памяти и диска всё равно нужно наблюдать через `docker stats` и `df -h`.

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
для DNS-имени `redis`, а также пустые каталоги для карты и OSRM.

### 3. Карта и маршрутизация

Сначала локально проверить подготовленные данные:

```bash
test -s maps/runtime/config.json
test -s maps/runtime/data/turkmenistan.mbtiles
test -s routing/runtime/current/turkmenistan-latest.osrm.cells
test -s routing/runtime/current/turkmenistan-latest.osrm.mldgr
```

Затем один раз передать только runtime-данные:

```bash
rsync -az --delete \
  --exclude downloads/ \
  --exclude .staging/ \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  maps/runtime/ \
  ubuntu@216.250.12.132:/opt/alowalow/development/maps-runtime/
rsync -az --delete \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  routing/runtime/current/ \
  ubuntu@216.250.12.132:/opt/alowalow/development/routing-runtime/current/
```

`--chmod` гарантирует чтение файлов непривилегированными TileServer и OSRM,
но старый macOS rsync может сохранить исходный режим уже существующего файла.
Поэтому после передачи права явно нормализуются на сервере; скачанные архивы и
staging-каталоги туда не передаются:

```bash
ssh ubuntu@216.250.12.132 \
  'find /opt/alowalow/development/maps-runtime -type d -exec chmod 755 {} + && \
   find /opt/alowalow/development/maps-runtime -type f -exec chmod 644 {} + && \
   find /opt/alowalow/development/routing-runtime/current -type d -exec chmod 755 {} + && \
   find /opt/alowalow/development/routing-runtime/current -type f -exec chmod 644 {} + && \
   test -r /opt/alowalow/development/maps-runtime/config.json && \
   test -r /opt/alowalow/development/routing-runtime/current/turkmenistan-latest.osrm.fileIndex'
```

### 4. Runtime secrets

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
https://216.250.12.132
```

### 5. GitHub Environment

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
DEVELOPMENT_CERTIFICATE_RENEWAL_ENABLED=false
```

Используется отдельный deploy SSH key. Пароль Ubuntu не сохраняется в GitHub.
Host key должен быть проверен заранее и сохранён целиком в
`DEPLOY_SSH_KNOWN_HOSTS`.

Если GHCR images приватные, deploy job передаёт свой короткоживущий
`GITHUB_TOKEN` в `docker login` через SSH stdin и выполняет `docker logout` в
cleanup trap. Постоянный GitHub token на сервере не хранится.

## HTTPS по IP без домена

Геолокация в браузере требует безопасный HTTPS context. DEV поэтому доступен
по `https://216.250.12.132`, а HTTP используется только для ACME и redirect.

Let’s Encrypt выдаёт short-lived IP certificates. Нужен Certbot 5.4 или новее,
HTTP-01 challenge и автоматическое продление. VDS не видит ACME API и Snap CDN,
поэтому сам сертификаты не запрашивает. Certbot 5.7 запускается на доверенной
рабочей машине для первого выпуска и затем в GitHub Actions. Auth/cleanup hooks
передают на VDS по проверенному SSH только challenge token.

1. Создать отдельный webroot и установить ACME snippet:

   ```bash
   sudo install -d -m 755 /var/lib/alowalow-acme/.well-known/acme-challenge
   ```

2. Установить `deploy/nginx/alowalow-acme-bootstrap.conf` как временный
   HTTP-only site. До reload обязательно:

   ```bash
   sudo nginx -t
   ```

3. На доверенной машине установить pinned Certbot в отдельное окружение и
   проверить staging через SSH hooks:

   ```bash
   export DEPLOY_SSH_HOST=216.250.12.132
   export DEPLOY_SSH_USER=ubuntu
   export DEPLOY_SSH_KEY_FILE="$HOME/.ssh/a7_tagam_deploy"

   certbot certonly \
     --staging \
     --preferred-profile shortlived \
     --manual \
     --preferred-challenges http \
     --manual-auth-hook "$PWD/deploy/certbot-remote-auth.sh" \
     --manual-cleanup-hook "$PWD/deploy/certbot-remote-cleanup.sh" \
     --ip-address 216.250.12.132
   ```

4. После staging повторить без `--staging`, используя отдельный production
   config-dir. Скопировать весь полученный ACME state в закрытый
   `/opt/alowalow/acme-state`, а `/etc/letsencrypt` направить на этот каталог.
   Затем отключить bootstrap site, включить
   `deploy/nginx/alowalow-development.conf` и выполнить `sudo nginx -t` перед
   reload.

5. Workflow `.github/workflows/development-certificate.yml` каждые 12 часов
   скачивает ACME state по SSH, выполняет `certbot renew`, атомарно возвращает
   state, проверяет Nginx и делает reload. Certbot обновляет сертификат только
   при достижении окна renewal. До первого успешного production-выпуска
   `DEVELOPMENT_CERTIFICATE_RENEWAL_ENABLED=false`; после установки state
   переменная переключается на `true`.

IP-сертификат Let’s Encrypt действует около шести дней. Renewal и reload Nginx
обязаны работать автоматически до передачи стенда мобильным разработчикам.

Текущий сетевой аудит 2026-08-15: при двух staging-попытках два-три
multi-perspective узла Let’s Encrypt успешно получили HTTP-01 token, но ещё один
узел получил `connection refused`. Пока Telecom не исправит международный
маршрут до порта `80`, trusted IP certificate не выпускается, bootstrap site
остаётся включённым, а `DEVELOPMENT_CERTIFICATE_RENEWAL_ENABLED=false`. Нельзя
выдавать self-signed сертификат за готовый публичный HTTPS.

## Автодеплой

После подготовки сервера и успешной ручной проверки DEV:

```text
DEVELOPMENT_DEPLOY_ENABLED=true
```

Merge/push в `main`:

1. прогоняет все проверки;
2. публикует API, migration и admin images в GHCR;
3. передаёт серверу только Compose-файлы и immutable digest-ссылки;
4. запускает `/opt/alowalow/development/deploy-production.sh`;
5. ожидает healthcheck API и статической админки.

Проверка:

```bash
curl --fail https://216.250.12.132/api/v1/health
curl --fail https://216.250.12.132/
curl --fail https://216.250.12.132/docs-json
curl --fail https://216.250.12.132/tiles/styles/alowalow/8/165/101.png
docker compose \
  --env-file /opt/alowalow/development/.release.env \
  --file /opt/alowalow/development/docker-compose.production.yml \
  --file /opt/alowalow/development/docker-compose.development.yml \
  ps
```

Production на этом сервере не запускается. К ней можно вернуться только после
выделения отдельного production host или отдельного согласованного capacity и
security review.
