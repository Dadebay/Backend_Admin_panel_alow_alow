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
| HTTP/HTTPS | `80` → HTTPS redirect; `443` — `https://a7-tagam.com.tm` |
| SSH | `22` для администрирования; временно `443` для GitHub deploy |
| React SPA | `127.0.0.1:3001` |
| NestJS API | `127.0.0.1:4001` |
| Карта | `127.0.0.1:8080`, наружу только через `/tiles/` |
| OSRM | только Docker-сеть, без host-порта |
| PostgreSQL | отдельный Docker volume, без host-порта |
| Redis | отдельный TLS-контейнер, без host-порта |
| MinIO | отдельный Docker volume, без host-порта |
| Compose project | `alowalow-development` |

После установки сертификата от Turkmen Telecom Nginx на `443` проксирует `/api/v1/*`,
`/docs` и `/docs-json` в NestJS, а остальные запросы — в статический React/Vite
SPA-контейнер. Admin собран с
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

## Где хранятся ключи и токены

- SSH private key `a7_tagam_deploy` хранится только на доверенной машине
  разработчика с правами `600` и в зашифрованном GitHub Environment Secret
  `DEPLOY_SSH_PRIVATE_KEY`. В панели Telecom и
  `/home/ubuntu/.ssh/authorized_keys` хранится только безопасная публичная
  часть. SSH key не имеет отношения к JWT приложения.
- JWT signing secret находится только в
  `/opt/alowalow/development/.env.development` с правами `600`; он не попадает
  в Git, frontend, мобильное приложение или PostgreSQL.
- Access token — подписанный JWT. Новые токены действуют 365 дней, содержат
  идентификатор серверной сессии `sid` и не сохраняются backend как plaintext.
- Refresh token действует 365 дней. Backend хранит в PostgreSQL только его
  Argon2 hash и срок действия. Refresh атомарно отзывает старую сессию и
  выпускает новую; logout отзывает сессию, поэтому связанный годовой access
  token сразу перестаёт приниматься.
- React admin хранит текущую пару только в `sessionStorage`, поэтому закрытие
  вкладки удаляет локальную сессию. Android должен использовать защищённое
  хранилище на базе Android Keystore, iOS — Keychain.

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

Временный статический OTP для одного согласованного тестового номера включается
только в server-side `.env.development`:

```env
DEPLOYMENT_ENVIRONMENT=development
LONG_LIVED_TEST_OTP_ENABLED=true
LONG_LIVED_TEST_OTP_PHONE=+993XXXXXXXX
LONG_LIVED_TEST_OTP_CODE=<6 случайных цифр>
LONG_LIVED_TEST_OTP_EXPIRES_AT=<ISO UTC не позднее чем через 366 дней>
```

Код нельзя добавлять в Git, frontend или логи. Он не является бессрочным и не
отменяет обычный OTP-флоу: перед каждой проверкой клиент вызывает request,
получает отдельный 5-минутный Redis challenge, а успешная проверка потребляет
его один раз. Для production обязательно
`DEPLOYMENT_ENVIRONMENT=production` и `LONG_LIVED_TEST_OTP_ENABLED=false`;
backend откажется запускаться при попытке включить исключение.

Для push-уведомлений DEV runtime также получает отдельный Firebase service
account в `FCM_SERVICE_ACCOUNT_BASE64`. JSON кодируется одной строкой командой
`base64 < firebase-service-account.json | tr -d '\n'`; исходный JSON и base64
не коммитятся и не помещаются в frontend/GitHub build variables. В публичном
DEV/production `PUSH_PROVIDER=fcm`; `console` разрешён только локально.

`CORS_ORIGINS` должен быть ровно:

```text
https://a7-tagam.com.tm
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
DEPLOY_SSH_PORT=443
DEVELOPMENT_CERTIFICATE_RENEWAL_ENABLED=false
```

Используется отдельный deploy SSH key. Пароль Ubuntu не сохраняется в GitHub.
Host key должен быть проверен заранее и сохранён целиком в
`DEPLOY_SSH_KNOWN_HOSTS`. Для нестандартного порта запись имеет вид
`[216.250.12.132]:443 ssh-ed25519 ...`; secret содержит записи и для `22`, и
для `443`.

Международный маршрут Telecom не пропускает SSH GitHub-hosted runner на порт
`22`, поэтому deploy временно использует тот же sshd на `443`. Это не второй
SSH-сервер и не VPN. Перед включением Nginx HTTPS порт `443` надо вернуть Nginx,
а deploy перевести на доступный отдельный transport.

Если GHCR images приватные, deploy job передаёт свой короткоживущий
`GITHUB_TOKEN` в `docker login` через SSH stdin и выполняет `docker logout` в
cleanup trap. Постоянный GitHub token на сервере не хранится.

## HTTPS домена через Turkmen Telecom

Единый origin системы — `https://a7-tagam.com.tm`. Бесплатный IP-сертификат и
Let’s Encrypt не входят в целевую схему: домен и SSL заказаны у Turkmen Telecom,
а сайт предназначен для внутренней сети. Относительные пути уже позволяют
разместить всё на одном домене:

```text
/                       React admin
/api/v1/                NestJS API и публичные media URL
/docs, /docs-json       Swagger
/tiles/                 TileServer GL
```

OSRM остаётся Docker-internal и доступен мобильным клиентам только через
авторизованный backend routing contract.

1. DNS `A` для `a7-tagam.com.tm` направляется на `216.250.12.132`.
2. Private key сертификата создаётся или устанавливается только на VDS. Целевые
   пути Nginx: `/etc/nginx/ssl/a7-tagam.com.tm/fullchain.pem` и
   `/etc/nginx/ssl/a7-tagam.com.tm/privkey.pem`; если Telecom использует другие
   пути, конфигурация меняется до активации.
3. До включения сайта Telecom должен подтвердить, кто продлевает сертификат и
   что его SAN содержит ровно `a7-tagam.com.tm`.
4. SSH освобождает `443`, после чего включается
   `deploy/nginx/alowalow-development.conf`. Перед reload обязательны
   `sudo nginx -t` и локальные healthchecks upstream-контейнеров.
5. HTTP после активации используется только для redirect на HTTPS.

Старый ACME workflow остаётся выключенным и не должен активироваться для
Telecom-сертификата.

### Временный HTTP до установки SSL

По явному решению заказчика внутреннее тестирование временно доступно на
`http://216.250.12.132` через
`deploy/nginx/alowalow-http-temporary.conf`. Конфигурация проксирует admin,
API, Swagger и tiles через один origin и добавляет диагностический заголовок
`X-A7-Temporary-HTTP: true`.

HTTP- и HTTPS-конфигурации хранятся параллельно, но в Nginx активируется только
одна из них. Во временном HTTP-site для `/docs` сохраняется строгий CSP без
`upgrade-insecure-requests`; иначе браузер пытается загрузить Swagger assets с
ещё не настроенного HTTPS и показывает пустую страницу. Финальная
`alowalow-development.conf` сохраняет обычное принудительное HTTPS-поведение.

Telecom также сбрасывает временные HTTP-запросы, если URL asset содержит слово
`runtime`. Поэтому production-сборка React использует нейтральные имена
`/assets/chunk-<hash>.js`; содержимое и разделение чанков не меняются. API и
карта используют относительные same-origin пути `/api/v1` и `/tiles`, поэтому
одна и та же сборка работает сейчас по HTTP IP и позже по HTTPS домену.
Nginx переписывает создаваемые TileServer GL абсолютные `localhost` URL внутри
JSON style/data contracts на текущий public origin с префиксом `/tiles`; PNG и
PBF payloads при этом не преобразуются.

Текущий HTTP-site устанавливается и включается так:

```bash
sudo install -m 0644 deploy/nginx/alowalow-http-temporary.conf \
  /etc/nginx/sites-available/a7-tagam-http-temporary.conf
sudo ln -sfn /etc/nginx/sites-available/a7-tagam-http-temporary.conf \
  /etc/nginx/sites-enabled/a7-tagam-http-temporary.conf
sudo nginx -t
sudo systemctl reload nginx
```

После получения сертификата конфигурация HTTPS сначала устанавливается в
`sites-available`, затем HTTP symlink удаляется, HTTPS symlink включается, и
только после успешного `nginx -t` выполняется reload. Файлы application stack и
данные Compose при этом не меняются.

Это не production TLS: токены и OTP не защищены на транспортном уровне, а
browser geolocation не работает в insecure context. При установке сертификата
временный site удаляется, включается `alowalow-development.conf`, а порт `80`
оставляется только для HTTPS redirect.

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
curl --fail https://a7-tagam.com.tm/api/v1/health
curl --fail https://a7-tagam.com.tm/
curl --fail https://a7-tagam.com.tm/docs-json
curl --fail https://a7-tagam.com.tm/tiles/styles/alowalow/8/165/101.png
docker compose \
  --env-file /opt/alowalow/development/.release.env \
  --file /opt/alowalow/development/docker-compose.production.yml \
  --file /opt/alowalow/development/docker-compose.development.yml \
  ps
```

Production на этом сервере не запускается. К ней можно вернуться только после
выделения отдельного production host или отдельного согласованного capacity и
security review.
