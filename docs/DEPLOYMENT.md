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
| Production origin | `https://a7-tagam.com.tm` |

`NODE_ENV=production` and `DEPLOYMENT_ENVIRONMENT=production` are both
mandatory. Production rejects console SMS, console push and insecure Redis.
A test OTP exception is rejected unless it has a phone allowlist, a four- or
six-digit env-only code, a future expiry within 32 days and an explicit
production acknowledgement.

## Repository deployment files

- `deploy/compose.production.yml`: hardened API, migration and static admin
  containers.
- `deploy/compose.single-host.yml`: private PostgreSQL, TLS Redis, MinIO,
  TileServer GL, OSRM and Nominatim for the current single VDS.
- `deploy/deploy-production.sh`: pull, migrate, health-check and rollback.
- `deploy/sync-test-otp-env.sh`: validates and atomically installs the optional
  encrypted test-OTP secret bundle without printing its values.
- `deploy/prepare-production-host.sh`: one-time directories, Redis TLS and host
  sysctl preparation.
- `deploy/production.env.example`: key names/placeholders only.
- `deploy/nginx/alowalow-http-temporary.conf`: inactive historical HTTP
  rollback configuration; do not enable in production.
- `deploy/nginx/alowalow-production.conf`: active Telecom TLS origin.
- `.github/workflows/production-ops.yml`: manual read-only bounded API
  diagnostics for incidents where direct bootstrap-password SSH is disabled.

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
LONG_LIVED_TEST_OTP_PRODUCTION_ACKNOWLEDGED=false
SMS_PROVIDER=android_pull
SMS_GATEWAY_AUTH_REQUIRED=false
PUSH_PROVIDER=fcm
ACCESS_TOKEN_TTL=365d
REFRESH_TOKEN_TTL_DAYS=365
CORS_ORIGINS=https://a7-tagam.com.tm
```

During the temporary mobile integration window the three Android SMS gateway
endpoints require neither a user JWT nor a device token. The server keeps
`SMS_GATEWAY_DEVICE_ID`, `SMS_GATEWAY_DEVICE_TOKEN` and the encryption key in
its env so authentication can later be enabled with
`SMS_GATEWAY_AUTH_REQUIRED=true` without changing the queue protocol. Normal
OTPs remain random, expire after five minutes and are consumed once.

During the approved customer-testing window, production may configure up to ten
phone numbers in `LONG_LIVED_TEST_OTP_PHONES` and enable the exception with
`LONG_LIVED_TEST_OTP_PRODUCTION_ACKNOWLEDGED=true`. The current window covers
two accounts and ends on 2026-09-17. Phone numbers and the code are never stored
in Git or documentation. The reusable value only replaces SMS delivery: every
login still needs a rate-limited request, a one-time five-minute Redis challenge
and succeeds once. Expired allowlisted entries automatically fall back to the
Android gateway. Disable and clear all exception fields when testing ends.

## GitHub configuration

Repository variable:

```text
PRODUCTION_DEPLOY_ENABLED=true
```

GitHub Environment `production` variables:

```text
API_PORT=4000
ADMIN_PORT=3000
DEPLOY_SSH_PORT=22
```

Encrypted Environment secrets:

```text
DEPLOY_SSH_HOST
DEPLOY_SSH_USER
DEPLOY_SSH_PRIVATE_KEY
DEPLOY_SSH_KNOWN_HOSTS
LONG_LIVED_TEST_OTP_PHONES
LONG_LIVED_TEST_OTP_CODE
LONG_LIVED_TEST_OTP_EXPIRES_AT
```

The three `LONG_LIVED_TEST_OTP_*` secrets are temporary and must be supplied as
a complete set. They are copied only to the protected VDS env, never to an
image or frontend artifact. Remove them and clear the corresponding VDS env
fields after the approved test window.

Use a dedicated ED25519 deployment key. The Ubuntu password is not a GitHub
secret. `DEPLOY_SSH_KNOWN_HOSTS` contains verified host keys for the configured
port. The workflow uses the automatically generated job-scoped `GITHUB_TOKEN`
for GHCR login over SSH stdin and logs out after deployment, so the VDS stores
no permanent registry token.

Telecom currently blocks GitHub-hosted runners on SSH port 22. SSH remains on
22 for domestic administration and port 443 belongs exclusively to Nginx. Use
a domestic self-hosted runner or another Telecom-approved authenticated
transport before enabling unattended deployment; never move SSH back to 443.

## Automatic release

Every push to `main` must first pass backend/admin lint, builds, tests, coverage,
dependency audits, Swagger contract verification, receipt-agent Go tests and
Windows/macOS cross-builds, and hardened container checks.
The workflow then:

1. Builds API, migration and admin images with provenance and SBOM.
2. Publishes a `production` tag plus immutable commit tags to GHCR.
3. Resolves and transfers immutable digest references only.
4. Copies the Compose/deployment files and, when configured, atomically syncs
   the protected test-OTP values into `.env.production`.
5. Pulls all referenced images before mutating the active release manifest.
6. Runs `prisma migrate deploy` and starts the stack.
7. Waits for service health checks.
8. Restores the previous digest manifest if the new release is unhealthy.

The receipt print agent is not deployed to the VDS. CI uploads four separate
artifacts built from `apps/print-agent`: Windows x64/ARM64 and macOS
Intel/Apple Silicon. A workstation runs the matching executable on loopback
`127.0.0.1:17873`; the production admin origin is allowlisted by default. Its
wired adapter must have a persistent address in the same subnet as the private
LAN printers and no gateway. Printer IP assignment remains catalog data managed
through the admin, never an agent config file or frontend constant.

### Temporary domestic fallback record

On 2026-08-19 the quality, contract, container and GHCR publication jobs for
commit `890703c` succeeded, while every hosted-runner SSH deploy failed at the
Telecom boundary (`443` refused; a bounded `22` test timed out). Port 443 now
serves HTTPS and GitHub deployment metadata uses port 22. Production was
updated from the trusted domestic workstation using freshly built `linux/amd64`
images of the same Git commit, verified revision labels, a resumable checksum-verified
archive, the existing ED25519 deploy key and a local `pull_policy: never`
override. The fallback retained `.release.previous.env`, ran migration, waited
for all service health checks and stored no GHCR token on the VDS. The active
release references are temporarily local SHA tags; a later successful standard
deploy replaces them with immutable GHCR digests. Do not repeat this fallback
without the same checksum, revision, rollback and health-check controls.

The active and previous release references are:

```text
/opt/alowalow/production/.release.env
/opt/alowalow/production/.release.previous.env
```

They contain image references and Compose metadata, not application secrets.

## Controlled catalog seed import

Never execute a script received inside a seed archive and never run the general
`db:seed` command against production. The repository-owned importer treats the
archive as untrusted input, rejects unknown fields or an incomplete/extra image
set, fully decodes every WebP, and defaults to a non-mutating dry run:

```bash
npm --prefix apps/api run catalog:seed -- \
  --source /absolute/path/to/seed_package
```

An apply is explicit. It uploads validated objects to the configured private
S3 bucket first and then upserts the database in one serializable transaction:

```bash
npm --prefix apps/api run catalog:seed -- \
  --source /absolute/path/to/seed_package \
  --apply
```

To replace the visible menu rather than only upsert supplied slugs, add the
separate explicit flag below. Product rows may include a nullable
`receiptPrinterIp`; non-private or malformed IPv4 values fail validation.
Products may also provide a selector label and up to 30 explicit sellable
variants. Supplied variants are synchronized by name; omitting the variants
field preserves existing options. The replacement soft-disables omitted
products and categories in the same transaction, preserving historical orders,
and does not replace banners:

```bash
npm --prefix apps/api run catalog:seed -- \
  --source /absolute/path/to/seed_package \
  --apply \
  --replace-catalog
```

For production, first create and verify a timestamped full PostgreSQL backup,
copy only `seed_export.json` plus the canonical `images/` directory into a
private mode-700 directory below `/opt/alowalow/production/imports`, and run
the importer through the immutable migration image with that package mounted
read-only. Do not expose runtime env values or copy the seed into an API/admin
image. After apply, verify catalog counts, every referenced `/api/v1/media/`
URL, public catalog/banner responses, API health, and the audit entry before
removing the private working copy. Retain the database backup according to the
backup policy.

The default import is safe to repeat: categories/products match by slug and
banners by media path. It does not delete unlisted catalog records, variants,
users, orders, or the pre-existing banner set. The optional replacement mode
only soft-disables omitted products/categories; it never deletes them or
touches the pre-existing banner set. Products with no image in the package do
not lose an image later added through the admin. The importer preserves
existing variants and keeps product price at the cheapest active variant.

## Active HTTPS and certificate renewal

Nginx terminates TLS for the admin, API, Swagger and map through one origin.
Port 80 has no application routes and returns a permanent redirect to
`https://a7-tagam.com.tm`.

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

The active certificate was issued by Sectigo through Turkmen Telecom for
`a7-tagam.com.tm` and `www.a7-tagam.com.tm`. It is valid from 2026-08-19 through
2027-03-05. Files are installed as:

```text
/etc/nginx/ssl/a7-tagam.com.tm/fullchain.pem  root:root 0644
/etc/nginx/ssl/a7-tagam.com.tm/privkey.pem    root:root 0600
```

Turkmen Telecom owns issuance and renewal; A7-tagam operations installs each
renewal. The private key is never committed, printed, put in a container image,
or stored as a GitHub secret. For renewal:

1. Verify SANs, validity and issuer with `openssl x509`; verify the leaf against
   the supplied CA bundle with `openssl verify`.
2. Compare SHA-256 hashes of the certificate public key and the public key
   derived from the private key. Stop if they differ.
3. Build `fullchain.pem` in leaf-first order, back up the current root-only TLS
   directory and stage the new files outside any served path.
4. Install the full chain at mode `0644` and private key at `0600` using
   `sudo install`; keep SSH on port 22.
5. Run `sudo nginx -t`. Reload Nginx only after it succeeds; restore the backup
   immediately if validation or reload fails.
6. Verify the external SNI chain, hostname, expiry, HTTP redirect, API health,
   Swagger and one map tile. `openssl s_client` must report
   `Verify return code: 0 (ok)`.

The old external ACME workflow is intentionally absent.

## Verification

Public HTTPS checks:

```bash
curl --fail https://a7-tagam.com.tm/
curl --fail https://a7-tagam.com.tm/api/v1/health
curl --fail https://a7-tagam.com.tm/docs-json
curl --fail --output /tmp/a7-tagam-map-tile.png \
  https://a7-tagam.com.tm/tile/10/677/395.png
printf '' | openssl s_client \
  -connect a7-tagam.com.tm:443 \
  -servername a7-tagam.com.tm \
  -verify_return_error
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
