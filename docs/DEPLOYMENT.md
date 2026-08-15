# Production deployment of A7-tagam

This repository has one active deployment path:

```text
main -> CI quality gates -> immutable GHCR images -> production VDS
```

There is no active DEV branch, GitHub Environment, host directory or Compose
stack. The future DEV design is recorded in `INFRASTRUCTURE.md` and must be
implemented as isolated infrastructure when it is actually needed.

The audited inventory, capacity, ports, services and secret boundaries are in
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md). This document owns provisioning,
deployment and recovery procedures.

## Production identity

| Resource | Value |
| --- | --- |
| Git branch | `main` |
| GitHub Environment | `production` |
| VDS | `216.250.12.132`, user `ubuntu` |
| Deployment directory | `/opt/alowalow/production` |
| Compose project | `alowalow-production` |
| Runtime env | `.env.production`, mode `600` |
| API loopback | `127.0.0.1:4000` |
| Admin loopback | `127.0.0.1:3000` |
| TileServer loopback | `127.0.0.1:8080` |
| Current origin | `http://216.250.12.132` |
| Final origin | `https://a7-tagam.com.tm` |

`NODE_ENV=production` and `DEPLOYMENT_ENVIRONMENT=production` are both
mandatory. Production rejects console SMS, console push, insecure Redis and a
long-lived/static OTP at application startup.

## Repository deployment files

- `deploy/compose.production.yml`: hardened API, migration and static admin
  containers.
- `deploy/compose.single-host.yml`: private PostgreSQL, TLS Redis, MinIO,
  TileServer GL, OSRM and Nominatim for the current single VDS.
- `deploy/deploy-production.sh`: pull, migrate, health-check and rollback.
- `deploy/prepare-production-host.sh`: one-time directories, Redis TLS and host
  sysctl preparation.
- `deploy/production.env.example`: key names/placeholders only.
- `deploy/nginx/alowalow-http-temporary.conf`: temporary HTTP origin.
- `deploy/nginx/alowalow-production.conf`: final Telecom TLS origin.

## One-time host preparation

Run only on a new production host after reviewing the target paths:

```bash
sudo sh deploy/prepare-production-host.sh
```

The script creates only `/opt/alowalow/production`, its map/routing directories
and a private Redis CA/key set. It also enables Redis's required
`vm.overcommit_memory=1`. It does not create runtime secrets, download map data
or start the application.

The current Turkmenistan map and routing artifacts live under:

```text
/opt/alowalow/production/maps-runtime
/opt/alowalow/production/routing-runtime/current
```

They are read-only inside application containers. Nominatim, PostgreSQL and
MinIO use explicit external production volumes created by the preparation
script. Never run Compose or Docker cleanup with `--volumes` against this host.

## Runtime environment

Create `/opt/alowalow/production/.env.production` from the example, replace
every placeholder independently, then protect it:

```bash
sudo chown ubuntu:ubuntu /opt/alowalow/production/.env.production
sudo chmod 600 /opt/alowalow/production/.env.production
```

Required categories are PostgreSQL, TLS Redis, JWT/OTP pepper, Android pull SMS,
Firebase FCM, MinIO/S3 and Nominatim. Real values never enter Git, GitHub build
variables, the React bundle or documentation.

The active production settings include:

```env
NODE_ENV=production
DEPLOYMENT_ENVIRONMENT=production
LONG_LIVED_TEST_OTP_ENABLED=false
SMS_PROVIDER=android_pull
PUSH_PROVIDER=fcm
ACCESS_TOKEN_TTL=365d
REFRESH_TOKEN_TTL_DAYS=365
CORS_ORIGINS=https://a7-tagam.com.tm
```

The Android device must use the same `SMS_GATEWAY_DEVICE_ID`, bearer token and
encryption key as the server env. Every OTP remains random, expires after five
minutes and is consumed once; production has no reusable OTP exception.

## GitHub configuration

Repository variable:

```text
PRODUCTION_DEPLOY_ENABLED=true
```

GitHub Environment `production` variables:

```text
API_PORT=4000
ADMIN_PORT=3000
DEPLOY_SSH_PORT=443
```

Encrypted Environment secrets:

```text
DEPLOY_SSH_HOST
DEPLOY_SSH_USER
DEPLOY_SSH_PRIVATE_KEY
DEPLOY_SSH_KNOWN_HOSTS
```

Use a dedicated ED25519 deployment key. The Ubuntu password is not a GitHub
secret. `DEPLOY_SSH_KNOWN_HOSTS` contains verified host keys for the configured
port. The workflow uses the automatically generated job-scoped `GITHUB_TOKEN`
for GHCR login over SSH stdin and logs out after deployment, so the VDS stores
no permanent registry token.

Telecom currently blocks GitHub-hosted runners on SSH port 22, so the same
hardened sshd temporarily also listens on 443. Before activating HTTPS, move
deployment SSH to another reachable transport and return port 443 to Nginx.

## Automatic release

Every push to `main` must first pass backend/admin lint, builds, tests, coverage,
dependency audits, Swagger contract verification and hardened container checks.
The workflow then:

1. Builds API, migration and admin images with provenance and SBOM.
2. Publishes a `production` tag plus immutable commit tags to GHCR.
3. Resolves and transfers immutable digest references only.
4. Copies the two Compose files and deployment script into the production
   directory.
5. Pulls all referenced images before mutating the active release manifest.
6. Runs `prisma migrate deploy` and starts the stack.
7. Waits for service health checks.
8. Restores the previous digest manifest if the new release is unhealthy.

The active and previous release references are:

```text
/opt/alowalow/production/.release.env
/opt/alowalow/production/.release.previous.env
```

They contain image references and Compose metadata, not application secrets.

## HTTP now, HTTPS later

The temporary HTTP site exposes the admin, API, Swagger and map through one
origin. It is an explicitly temporary production transport exception while
Telecom prepares the certificate; credentials and OTP are not protected on the
wire and browser geolocation is unavailable in an insecure context.

Current routes:

```text
/                       React admin
/api/v1/                NestJS API and media
/docs, /docs-json       Swagger
/tile/{z}/{x}/{y}.png   admin/mobile raster map of Turkmenistan
/tiles/                 TileServer GL
```

OSRM and Nominatim are never public. NestJS is the authorized route/geocoding
boundary.

When Telecom supplies the certificate:

1. Confirm DNS points `a7-tagam.com.tm` to the VDS inside the intended network.
2. Install the certificate/key under the reviewed Nginx paths.
3. Move sshd away from port 443 and update `DEPLOY_SSH_PORT`/known hosts.
4. Install `deploy/nginx/alowalow-production.conf` into `sites-available`.
5. Run `sudo nginx -t` before switching the enabled symlink.
6. Reload Nginx, verify HTTPS and leave port 80 only as an HTTPS redirect.
7. Remove mobile cleartext HTTP exceptions.

Turkmen Telecom owns certificate issuance and renewal. The old external ACME
workflow is intentionally absent.

## Verification

Public checks during the temporary HTTP period:

```bash
curl --fail http://216.250.12.132/
curl --fail http://216.250.12.132/api/v1/health
curl --fail http://216.250.12.132/docs-json
curl --fail --output /tmp/a7-tagam-map-tile.png \
  http://216.250.12.132/tile/10/677/395.png
```

Server checks:

```bash
cd /opt/alowalow/production
docker compose \
  --env-file .release.env \
  --file docker-compose.production.yml \
  --file docker-compose.single-host.yml \
  ps
docker stats --no-stream
sudo nginx -t
df -h /
free -h
```

Do not use `docker compose down --volumes`, `docker system prune --volumes` or
delete `.env.production`, `redis-tls`, `maps-runtime`, `routing-runtime` or
named volumes. PostgreSQL and MinIO still need encrypted off-host backups and a
tested restore procedure; Docker volumes alone are not backups.

## Future DEV, deliberately not implemented

Future DEV must have separate infrastructure: GitHub Environment and enable
variable, host/directory, Compose project, ports, databases, volumes, bucket,
secrets, Android gateway identity and monitoring. It must never reuse
production data or convert `/opt/alowalow/production` back to development.
Branch policy will be selected when that infrastructure is approved. Until
then, `main → production` is the only deployment path.
