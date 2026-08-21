# A7-tagam durable project context

Update this file whenever an accepted requirement or architectural decision
changes. It is intentionally concise and should be read before every task.

## Product

A7-tagam is a cash-on-delivery food ordering platform for Ashgabat with:

- a NestJS API;
- a pure React/Vite SPA operations admin;
- customer-facing API capabilities for phone login, addresses, catalog,
  ordering, promos, and ratings;
- an admin-visible recent-login list, populated only after a successful OTP
  verification;
- role-specific operations for kitchen, dispatch, courier, cash receipt, and
  accounting.

The NestJS API, React admin, generated OpenAPI contract, deployment manifests,
and CI/CD live in one GitHub monorepo and are changed through the same pull
requests. Separate backend/admin repositories are not parallel sources of
truth. Android applications remain separate because they have an independent
toolchain and release lifecycle.

The React admin is served only by the static Nginx container on the dedicated
VDS. ChatGPT Sites and Cloudflare Workers are not deployment targets. CI/CD
produces immutable API, migration and static Nginx admin images. The accepted
dedicated VDS target is `216.250.12.132` (4 vCPU, 4 GB RAM, 60 GB SSD) and
hosts the only active production stack, including TileServer GL, private OSRM
and Nominatim. There is no deployed DEV environment yet; it will be introduced
later with isolated compute, data, secrets, ports and a separate deployment
policy. Production is served at `https://a7-tagam.com.tm`; Nginx owns ports 80
and 443, with port 80 redirecting to HTTPS, while SSH remains on port 22.

The customer-facing brand is `A7-tagam`. Existing repository, package, service,
deployment-directory, map-style, and storage identifiers named `alowalow`
remain stable technical identifiers for backward compatibility. The admin uses
the supplied hot-food delivery-bag mark and only its cream `#FEF7E7`, navy
`#062F5E`, and orange `#EC7A1B` palette or blends derived from those colors.

## Stack and storage

- Node.js 24 LTS with npm 11.6.2, NestJS 11, Prisma 7, PostgreSQL 18.
- Redis 8 for temporary OTP challenges and rate controls.
- A dedicated Android phone with its own SIM is the primary production SMS
  gateway. It pulls encrypted, short-lived OTP jobs from the API over HTTPS and
  acknowledges delivery. It is the only production SMS provider; console is
  development-only.
- Firebase Cloud Messaging is the push transport for customer mobile devices.
  Firebase never owns A7-tagam authentication, OTP, users, roles, or business
  data. A PostgreSQL outbox/inbox records campaigns and delivery results;
  `console` is the non-delivering local provider.
- Private S3-compatible object storage; MinIO locally.
- An independently deployable self-hosted OpenStreetMap base-map service for
  Turkmenistan: Geofabrik Shortbread MBTiles, local VersaTiles assets, and an
  isolated TileServer GL container shared by web and mobile clients. The
  canonical current admin/mobile base-map contract is the simple raster XYZ
  URL `/tile/{z}/{x}/{y}.png`; JSON/MapLibre vector contracts remain optional
  advanced endpoints and are not required by mobile.
- A private OSRM driving engine built from the Turkmenistan OpenStreetMap
  extract. NestJS is its only consumer and exposes normalized, authorized
  courier routes; mobile clients never call OSRM directly.
- A server-side geocoding adapter provides explicit Turkmenistan place search
  and reverse geocoding. The closed-network VDS runs a private Nominatim 5.3
  index from the same Turkmenistan PBF as OSRM; it is Docker-internal and only
  NestJS may call it. Provider origins remain environment-configurable. Local
  workstation development may use public Nominatim with Photon fallback,
  bounded caching, and serialized primary-provider requests. Public Nominatim
  is never used for autocomplete.
- React 19, Vite 8, Swagger/OpenAPI-generated TypeScript schema.
- Local Docker services: PostgreSQL, Redis, MinIO.
- GitHub Actions CI/CD with GHCR API, migration and static admin images.
  `main` is the only deployment branch and automatically deploys immutable
  images to the GitHub `production` Environment and the single production VDS
  after every successful quality gate. DEV infrastructure is deferred and must
  not reuse production data or secrets when it is added.

Durable business data belongs in PostgreSQL. Temporary OTP data belongs in
Redis. Images belong in S3-compatible storage.

## Repository structure

This is the target structure and an architectural contract. When a task adds or
moves a major module, update this tree in the same change.

```text
alowalow/
├── AGENTS.md
├── package.json            # cross-project commands and contract tooling
├── package-lock.json       # root tooling lock
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       └── ci-cd.yml
├── docs/
│   ├── ANDROID_SMS_GATEWAY.md
│   ├── DEPLOYMENT.md
│   ├── INFRASTRUCTURE.md
│   ├── MOBILE_MAP_AND_ROUTING.md
│   ├── MOBILE_PUSH_NOTIFICATIONS.md
│   └── PROJECT_CONTEXT.md
├── deploy/
│   ├── nginx/
│   │   ├── alowalow-http-temporary.conf
│   │   └── alowalow-production.conf
│   ├── compose.production.yml
│   ├── compose.single-host.yml
│   ├── deploy-production.sh
│   ├── prepare-production-host.sh
│   └── production.env.example
├── maps/
│   ├── compose.yml         # isolated local TileServer GL
│   ├── config.json         # raster/vector endpoints and local assets
│   ├── prepare.sh          # atomic regional data/style preparation
│   └── runtime/            # ignored downloaded MBTiles/fonts/sprites
├── routing/
│   ├── compose.yml         # private local OSRM service
│   ├── prepare.sh          # atomic MLD driving-graph preparation
│   └── runtime/            # ignored OSM PBF and generated route graph
├── apps/
│   ├── api/
│   │   ├── AGENTS.md
│   │   ├── Dockerfile
│   │   ├── package-lock.json # isolated backend dependency/security tree
│   │   ├── prisma/
│   │   │   ├── catalog-seed.ts # validated/idempotent catalog import core
│   │   │   ├── import-catalog-seed.ts # dry-run/apply operational CLI
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── auth/      # OTP, JWT, refresh, Android pull SMS gateway
│   │   │   ├── users/     # staff and customer addresses
│   │   │   ├── branches/  # branch CRUD and nearest-branch selection
│   │   │   ├── catalog/   # categories and products
│   │   │   ├── marketing/ # banners and promo codes
│   │   │   ├── media/     # S3-compatible image storage
│   │   │   ├── notifications/ # customer inbox and FCM campaign outbox
│   │   │   ├── orders/    # workflow, assignment, route, rating, cash
│   │   │   ├── tracking/  # courier GPS and dispatch map snapshot
│   │   │   ├── routing/   # validated private OSRM adapter
│   │   │   ├── geocoding/ # provider-swappable OSM search/reverse adapter
│   │   │   ├── common/    # guards, decorators, shared HTTP types
│   │   │   ├── config/    # validated environment configuration
│   │   │   ├── prisma/    # Prisma service/module
│   │   │   ├── redis/     # Redis infrastructure adapter
│   │   │   └── generated/ # generated Prisma client; never edit manually
│   │   └── test/          # unit and isolated HTTP e2e tests
│   ├── print-agent/       # loopback Windows/macOS LAN receipt-print bridge
│   └── admin/
│       ├── AGENTS.md
│       ├── Dockerfile     # static SPA image served by unprivileged Nginx
│       ├── index.html     # Vite browser entry document
│       ├── nginx.conf     # static assets, cache policy, SPA route fallback
│       ├── package-lock.json # isolated frontend dependency/security tree
│       ├── src/            # FSD product layers
│       │   ├── app/        # SPA bootstrap, routes, providers, global styles
│       │   ├── widgets/    # boards/maps/managers, incl. assisted phone order
│       │   ├── features/   # typed mutations, assisted orders, new-order alerts
│       │   ├── entities/   # typed queries/models, incl. customer/geocoding
│       │   └── shared/     # HTTP/query clients, auth, Zod form helpers, UI
│       ├── public/
│       └── tests/
├── packages/
│   └── api-contract/
│       └── src/schema.ts   # generated from apps/api/openapi.json
└── docker-compose.yml      # PostgreSQL, Redis, MinIO for local development
```

Backend modules normally contain a module, controller, service, DTOs, and a
policy file when the domain has authorization or state-transition rules.

Frontend slice internals should use:

```text
slice/
├── api/       # queries and mutations
├── model/     # types, query keys, state, domain helpers
├── ui/        # components and table columns
├── lib/       # private slice helpers when necessary
└── index.ts   # public API for cross-slice imports
```

The allowed frontend dependency direction is:

```text
app → widgets → features → entities → shared
```

Do not expand the current monolithic `app/page.tsx`. Migrate touched behavior
into the target FSD structure. Do not put NestJS business logic in controllers,
Prisma access in React, or duplicate backend policies in client state.

## Roles

- `CUSTOMER`: own addresses, orders, cancellation where allowed, rating.
- `OPERATOR`: monitors orders that enter the kitchen automatically, assigns
  packed orders to couriers, receives returned cash, may cancel before cooking
  starts, and may create a cash order for a caller through the assisted-order
  API/admin form.
- `COOK`: accepts `SENT_TO_KITCHEN` orders and marks them `COOKING`/`READY`.
- `COURIER`: handles only assigned orders and returns collected cash.
- `ACCOUNTANT`: performs final cash reconciliation.
- `ADMIN`: operational administration and full order workflow control.
- `SUPER_ADMIN`: owner-level administrator with all admin access and protected
  authority over the `SUPER_ADMIN` role.

Only `ADMIN` and `SUPER_ADMIN` may create or retry a customer notification
campaign. `OPERATOR`, `COOK`, `COURIER`, and `ACCOUNTANT` cannot send broadcasts.

Only `OPERATOR`, `ADMIN`, and `SUPER_ADMIN` may create a phone-assisted order.
The regular customer order endpoint accepts only `CUSTOMER`; staff cannot use
their own staff account as the customer of an ordinary order.

Only `SUPER_ADMIN` may manage another `SUPER_ADMIN`, and the system must retain
at least one active `SUPER_ADMIN`.

The React/Vite web admin accepts sessions only for `ACCOUNTANT`, `ADMIN`, and
`SUPER_ADMIN`. `CUSTOMER`, `OPERATOR`, `COOK`, and `COURIER` cannot enter the
web admin or retain an OTP session there; their backend roles and mobile/API
workflows remain unchanged. The web courier route is intentionally absent.

Every operations-admin section owns a canonical browser URL and is composed
through React Router's declarative `BrowserRouter` layout. `/` redirects to
`/orders`; the courier dispatch map is `/couriers/map`, and the remaining
management sections use their stable top-level paths. Sidebar navigation uses
history-aware links, direct loads are served through the Nginx SPA fallback,
and a role-forbidden section redirects to that staff role's default allowed
section. Backend authorization remains authoritative.

The admin order workspace defaults to a role-aware Kanban backed by the same
paginated order API and mutation policy as the table. `ACCOUNTANT`, `ADMIN`,
and `SUPER_ADMIN` see three active lanes: kitchen (received through cooking),
ready, and courier (assignment through cash return). Completed, reconciled,
and cancelled orders remain available in one collapsed archive below the
board. Accountant cards omit customer identity, delivery address, and dish
composition. There is no separate cash page: cash-return, completion, and
reconciliation remain order statuses and are handled from `/orders`. The
detailed table is available only to `ADMIN` and `SUPER_ADMIN`. Hiding frontend
navigation or card fields is usability and data minimization only—the NestJS
guards, role scope, and order policy remain the authorization authority.

## Order state machine

```text
SENT_TO_KITCHEN
→ COOKING (optional compatibility step)
→ READY
→ packing confirmed by an administrator
→ ASSIGNED_TO_COURIER
→ OUT_FOR_DELIVERY
→ DELIVERED
→ CASH_RETURNED
→ COMPLETED
→ RECONCILED
```

`CANCELLED` is terminal.

Role ownership:

- customer-app and assisted orders are created directly as
  `SENT_TO_KITCHEN`; the normal UI has no confirm or kitchen-handoff action;
- cook/admin may use `SENT_TO_KITCHEN → COOKING → READY` for backward
  compatibility or move directly `SENT_TO_KITCHEN → READY`;
- at `READY`, an `ADMIN` or `SUPER_ADMIN` must check every immutable order
  line in the assembly UI and persist one packing confirmation; courier
  assignment is rejected until that confirmation exists;
- operator/admin then assigns the packed `READY` order to an active courier and may correct
  that courier while the order remains `ASSIGNED_TO_COURIER`; correction is
  forbidden after `OUT_FOR_DELIVERY` begins;
- assigned courier/admin:
  `ASSIGNED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED → CASH_RETURNED`;
- operator/admin: `CASH_RETURNED → COMPLETED`;
- accountant/admin: `COMPLETED → RECONCILED`;
- `SUPER_ADMIN` inherits admin transitions.

Cancellation:

- customer owner: legacy `NEW` orders only; newly submitted orders enter the
  kitchen immediately, so customer cancellation remains unavailable until a
  separate cancellation requirement is accepted;
- `OPERATOR`, `ADMIN`, `SUPER_ADMIN`:
  `NEW`, `CONFIRMED`, `SENT_TO_KITCHEN`;
- no role may cancel once status is `COOKING` or later.

Every mutation uses the order `version` for optimistic concurrency. Status
changes record an order transition; a same-status courier correction records a
dedicated audit event with the previous and new courier IDs.

## Courier behavior

A courier may receive multiple orders simultaneously. Do not enforce a
one-active-order rule. The courier work list contains every assigned active
stop with address, coordinates, customer, item count, and cash amount.
Individual orders progress independently. Do not draw straight lines between
stops and call them routes. The authenticated courier route is built from the
latest fresh Redis GPS point, each unique not-yet-picked-up branch, and every
active delivery stop in assignment order. Private OSRM returns real road geometry,
distance, duration, legs, and maneuvers. If OSRM is down, the API preserves
stops and explicitly reports routing as unavailable.

Both mobile and dispatch use the same backend-owned route contract. `stops`
always contains every active assigned order; `route.nextWaypoints` exposes only
the next one to three actionable pickup/delivery points for concise navigation.
`route.planId` deterministically identifies the ordered inputs and generated
road geometry, allowing admin and mobile to verify that they render the same
plan. An operator/admin may request the selected courier's route through the
role-protected dispatcher endpoint; a courier may request only their own route.
Every fresh courier GPS event invalidates the active dispatcher route, and
clients refresh at the backend's 15-second recommendation so deviation or a
U-turn is recalculated from the latest position.

The current OSM extract/OSRM graph has no live traffic or temporary road-closure
feed. GPS-based recalculation adapts after the courier deviates, but cannot know
about an unreported closure in advance. A future closure capability must ingest
a trusted provider or operator-managed restriction source on the backend and
apply it to routing; clients must not invent independent routes or claim a
live-traffic ETA.

Only the authenticated `COURIER` may publish or delete their own current point.
The latest point is ephemeral operational data in Redis with a 15-minute TTL;
it is `ONLINE` for five minutes, then `STALE` until expiry. The dispatch view is
restricted to `OPERATOR`, `ADMIN`, and `SUPER_ADMIN` and includes each active
courier, latest location, all active assigned orders, delivery coordinates,
customer contact details, items, and cash to collect.

The previous 120-second courier publish interval plus 30-second admin polling
is only a near-real-time fallback and is no longer the accepted live-tracking
target. During an active delivery the mobile client should publish a fresh GPS
reading approximately every 10–15 seconds, adapting to platform background and
battery restrictions. NestJS remains the authenticated ingestion boundary,
stores the newest point in Redis, and pushes each accepted point through the
role-protected `/tracking/dispatch/live` SSE stream. The admin applies those
events directly to the existing TanStack Query snapshot cache. A slower
periodic snapshot remains only for initial state and reconnect recovery.

The base-map service is independent from courier tracking. It serves only the
public base-map style, vector PBF data, and Leaflet-compatible raster PNG tiles;
it never receives or stores GPS, order, customer, or staff data. Web and mobile
clients render the same base map and overlay their authorized dynamic markers.
OSRM is a separate internal service and receives only the coordinates needed
for an authorized route from NestJS. It is not exposed to mobile/web clients
and never receives customer names, phones, tokens, or order payloads.
Nominatim is another private internal service: it builds the address-search
index from the checked Turkmenistan OSM PBF, receives only search text or map
coordinates from NestJS, and is never exposed through Nginx. The API does not
wait for an unreachable public fallback when this internal origin is selected.

Collection points are active `Branch` records in PostgreSQL, never deployment
environment variables. Each courier order exposes its own branch snapshot, and
the dispatch map shows every active branch plus each order's branch and delivery
coordinates. Admins choose a branch point on an interactive map; clicking or
dragging the marker stores latitude and longitude internally. There are no
manual coordinate inputs: a new branch cannot be saved until staff places its
marker. `VITE_MAP_TILE_URL` and `VITE_MAP_ATTRIBUTION` are frontend build-time
settings. Local development uses the self-hosted TileServer GL raster endpoint;
deployment must proxy the same endpoint or provide an explicitly configured
compatible provider. New mobile clients use the same service's
`/styles/alowalow/style.json` MapLibre contract. A provider homepage is never
exposed in the branch form or treated as a raster tile endpoint.

The current A7-tagam style is the local VersaTiles Colorful vector style with
local sprites/fonts. Admin courier and branch maps use increased responsive
heights; visual density must not be reduced to the previous pale compact map.

## Customer and payment behavior

- Login/registration is by phone OTP. First and last name are optional.
- Access and rotating refresh tokens both have a 365-day maximum lifetime by
  explicit product decision. Every newly issued access JWT contains a `sid`
  bound to the Argon2-hashed PostgreSQL refresh-session record. Refresh rotation
  and logout revoke that record, so the associated long-lived access JWT is
  rejected immediately; inactive users are still rejected on every request.
  Legacy signed access tokens without `sid` remain accepted only for rollout
  compatibility and retain their originally signed expiry.
- Production OTP SMS is sent by a dedicated Android device. The device polls
  `GET /api/v1/internal/sms-gateway/pull` and acknowledges `SENT`, `DELIVERED`,
  or `FAILED` using the returned lease receipt. Pulling itself refreshes the
  device heartbeat. During the explicitly accepted temporary mobile
  integration window, `heartbeat`, `pull`, and `status` require neither a user
  JWT nor a device token. The existing bearer-device guard remains behind
  `SMS_GATEWAY_AUTH_REQUIRED`; setting it to `true` restores authentication
  without changing the Android queue protocol.
- OTP TTL is 5 minutes, resend cooldown 60 seconds, maximum 5 sends/hour and
  5 verification attempts. Successful verification is atomic and one-time.
- A temporary production test exception may be enabled only for an env-only
  allowlist of up to ten Turkmen phone numbers, with an explicit production
  acknowledgement and an expiry no more than 32 days away. The current
  customer-testing exception covers two accounts through 2026-09-17; phone
  numbers and the code never enter Git or documentation. Each login still
  requires a throttled request, creates a fresh one-time five-minute Redis
  challenge and permits at most five verification attempts. After expiry those
  numbers automatically return to random Android-delivered SMS OTP.
- Outbound SMS jobs are AES-256-GCM encrypted in Redis, expire after the OTP,
  are claimed atomically, and are retried at most three times after missing
  acknowledgements. A final failure cancels only the matching OTP request.
- A user may store up to 20 addresses.
- A newly created or selected address becomes active.
- The address used by the latest order becomes the active/default address.
- Orders keep immutable snapshots of the address plus product/variant name,
  price, and the product's optional LAN receipt-printer IPv4 address. Later
  catalog edits never rewrite historical order lines.
- An operator/admin phone order resolves an existing active customer by phone
  or creates a `CUSTOMER` record without issuing OTP, JWT, or refresh tokens.
  A staff phone number or inactive customer is rejected. Staff may reuse one
  of that customer's saved addresses or save a new map-selected address. An
  official result is selected from the accessible search dropdown; the
  unofficial address/landmark is optional. A marker is always sufficient: if
  OSM has no address and the optional landmark is blank, a stable coordinate
  label is stored with the address snapshot. Every such order is marked
  `STAFF_PHONE`, keeps the normal audit trail, prices/promos/branch rules, and
  remains otherwise identical to a customer-app order.
- A new order is assigned inside its creation transaction to the nearest active
  branch by straight-line Haversine distance from the selected delivery address.
- The order stores `branchId`, the computed distance, and an immutable branch
  name/address/coordinate snapshot. Renaming, moving, or disabling a branch
  does not rewrite historical orders.
- If there is no active branch, order creation fails with `409 Conflict`; an
  order is never created without an operational destination.
- Payment method is currently `CASH` only.
- Courier returns cash to operator; operator confirms receipt; accountant
  reconciles.
- Customer may submit one rating/comment after delivery.

## Catalog and marketing

Admins control branches, categories, products, descriptions, active status,
images, banners, and promo codes. Branch creation, editing, activation, and
deactivation are limited to `ADMIN` and `SUPER_ADMIN`; trusted operations roles
may list branches. The catalog is currently global and shared by every branch.
Images are validated, converted to WebP, and stored privately in S3-compatible
storage. Product availability, current price, promo limits, discount, delivery
fee, final total, and branch assignment are validated by the backend.

A product may optionally define one customer-facing variant selector label,
such as `Размер` or `Способ нарезки`, and up to 30 generic sellable variants.
Every variant has its own name, optional description, price, active state,
ordering, and up to 10 ordered images. This supports pizza sizes, hand/machine
meat cutting, and future choices without dish-specific database fields. The
public product `price` and `minPrice` are the cheapest active variant price when
active variants exist. `displayImageUrl` prefers that variant's first image and
falls back to the common product image.

Product and variant image references must be private WebP paths returned by the
media API. A product may have up to 10 common ordered images, and every variant
may independently have up to 10. Removed persisted variants are soft-disabled
so historical order references remain valid. The backend enforces the same
common-image limit for the single-image compatibility endpoint.

An administrator may assign one private LAN receipt-printer IPv4 address to a
product. The address is visible only through authenticated catalog-management
responses and is never exposed in the public catalog or customer order
responses. New order lines snapshot the configured address so a later catalog
edit cannot reroute an existing order. The intended non-fiscal printer payload
contains only the selected product/variant display name, quantity, and the
backend-snapshotted unit price. Delivery fees, discounts, fiscalization,
offline policy, cancellation, and returns are not part of this accepted
printer-routing requirement.

Receipt printing is triggered automatically on the always-open operations
workstation when its role-scoped active kitchen/ready queue first observes a
new order ID, and is also available as an explicit reprint for a
non-new, non-cancelled order. A browser-shared bounded claim list prevents the
same workstation's tabs from intentionally dispatching the same new order
twice; a failed automatic attempt remains visible and staff may use the manual
print action. NestJS builds the authoritative plan by grouping
immutable order lines by their snapshotted printer IP and reports any line with
no configured route. The remote VDS never connects to a private LAN address.
Instead, the HTTPS admin sends that plan to the A7-tagam receipt print agent on
the same workstation at loopback `127.0.0.1:17873`. The agent has one Go source
and CI-built executables for Windows x64/ARM64 and macOS Intel/Apple Silicon.
It accepts only allowlisted admin origins, rejects non-private IPv4 targets,
formats a prominent `ONLINE ORDER #<number>` header on every printer chunk,
then large item text with separators plus blank paper space above and below the
content before cutting, and sends bounded hexadecimal ESC/POS payloads
through the tested J-Speed WebConfig HTTP interface on each printer's LAN port 80. The agent contains no API token and binds to loopback only. A working
workstation remains necessary while accepting/printing an order; it is not a
separate gateway computer.

External catalog seed packages are never executed as supplied. The repository
CLI first performs a non-mutating strict JSON/file-set/WebP validation and only
mutates with an explicit `--apply`. It validates an optional private LAN
receipt-printer IPv4 address per product and optional generic sellable variants,
uploads all validated objects before one serializable PostgreSQL transaction,
upserts by category/product slug and banner media path, synchronizes variants
only when the package explicitly supplies them, preserves existing variants
otherwise, preserves existing images when an imported product has no image,
and records an aggregate audit event. Re-running the same package does not
duplicate catalog rows. An additional explicit
`--replace-catalog` mode soft-disables categories and products missing from the
package in that same transaction, preserving historical order references;
banners are not replaced by this option. Production requires a database backup
before apply; the general development `db:seed` command is not a production
import mechanism.

New order clients send `variantId` for a configured variant. For backward
compatibility, omitting it selects the cheapest active variant; an ID belonging
to another product or an inactive variant is rejected. Products without active
variants use their base price. The selected variant ID, name, unit price, and
line total are snapshotted on `OrderItem`, and its first image is preferred in
order responses.

## Customer notifications

- An authenticated `CUSTOMER` registers or refreshes their own FCM registration
  token. The legacy API field is still named `installationId`, but it contains
  the token used by Firebase Admin SDK. The same device may move to a new
  authenticated customer after logout/login, but one customer cannot
  deactivate another customer's device.
- `ADMIN` and `SUPER_ADMIN` create immediate broadcasts to all active customers.
  External URLs are rejected; an optional deep link must be an internal
  application path.
- Every campaign and every customer's inbox item is durable PostgreSQL data.
  Each active device gets a separate delivery record with result/error state.
- Campaign dispatch is a restart-safe database worker with atomic
  `PENDING → SENDING` claiming, stale-work recovery, batches of at most 500 and
  terminal `SENT`, `PARTIAL`, or `FAILED` status. Delivery is at least once;
  mobile clients deduplicate by `notificationId`.
- Customers may list only their own inbox, read their unread count, and mark one
  or all own notifications read. A push permission or network failure does not
  remove the durable inbox item.
- Firebase is transport only. A7-tagam phone OTP/JWT stays authoritative, and
  the FCM service account exists only in the backend runtime environment.

## Frontend status and target

Current status:

- the protected admin dashboard has no local demo arrays;
- orders, kitchen workflow, courier assignment, cash workflow, catalog,
  branches, banners, promos, notifications, and staff read/write through the
  NestJS API;
- administrators manage branch addresses and choose branch locations only with
  a map marker in a lazy-loaded FSD screen; the order board can filter by branch
  and shows the assigned distance;
- operators/admins can open a lazy phone-order flow from the order board, find
  a caller by phone, automatically select an exact phone match, prefill the
  active or last-used saved address while still offering every saved address,
  select active catalog items and their configured variants,
  perform an explicit OSM address search, edit an unofficial landmark, or put
  a draggable marker on the large map. TanStack Query owns all remote data,
  React Hook Form/Zod validate the form, and the backend computes the final
  amount and nearest branch;
- order details show the real status timeline plus the customer's five-star
  rating and comment returned by the API;
- the live order workspace defaults to a responsive Kanban with role-specific
  lanes, card fields, and actions. Operators/admins may switch to the detailed
  TanStack table, cooks work only through kitchen lanes, accountants see the
  complete lifecycle without customer PII, and couriers see all orders assigned
  to them below the GPS-sharing control;
- the dispatch map and courier GPS-sharing screen use Redis-backed tracking;
  accepted locations reach authorized dispatchers immediately through SSE,
  with the 30-second snapshot poll retained only as reconnect recovery;
- media forms upload validated WebP images to S3-compatible storage;
- the catalog editor creates and updates a dish with category, name, slug,
  description, base price, optional private LAN receipt-printer IPv4 address,
  availability, ordering, and up to 10 common S3 images; it also configures a
  generic selector with variant-specific prices, availability, ordering,
  descriptions, and up to 10 S3 images per variant;
- Swagger response DTOs generate the TypeScript contract used by the frontend;
- TanStack Query owns server state and TanStack Table renders admin lists;
- React Hook Form owns all admin form state and Zod schemas validate values
  before typed API mutations; multipart FormData exists only in the S3 upload
  transport;
- heavy management sections and the Leaflet map are dynamically split.
- the notification manager is a lazy FSD screen; only a pending/sending
  campaign triggers its three-second TanStack Query refresh, and polling stops
  when all visible campaigns are terminal.

Accepted target:

- refactor the admin to FSD layers;
- TanStack Query owns server state and mutations;
- TanStack Table owns admin list/table behavior;
- generated OpenAPI types are the API contract;
- route files remain thin and business behavior moves into entities, features,
  and widgets;
- the admin remains a client-rendered React/Vite SPA with no SSR, hydration,
  React Server Components, or continuously running Node frontend process;
- tables use server pagination/filtering/sorting, and large lists are
  virtualized only after measurement;
- maps, charts, and rarely used management flows are loaded outside the initial
  order-board bundle;
- query freshness, polling, retry, cancellation, and invalidation are defined
  per domain rather than hidden in global defaults.

Never report the admin as fully backend-connected until demo arrays have been
removed and critical workflows pass integration tests against NestJS.

Performance is a release requirement. Production p75 targets are LCP below
2.5 seconds, INP below 200 milliseconds, and CLS below 0.1. Changes to the live
order board, tables, maps, global providers, or API cache must be profiled for
unnecessary rerenders, duplicate requests, waterfalls, polling duplication,
and initial-bundle regression.

The 2026-07-27 tracking build measured the dashboard page chunk at 42.3 KB raw
/ 12.4 KB gzip and the dynamically imported Leaflet map chunk at 156.4 KB raw
/ 45.7 KB gzip. The map chunk was absent from the initial module-preload list.

The 2026-07-28 integrated build keeps the authenticated dashboard shell at
6.9 KB raw / 2.3 KB gzip and splits the order board (6.6 KB / 2.6 KB), catalog
(9.6 KB / 2.5 KB), marketing (11.6 KB / 3.1 KB), staff (5.2 KB / 2.1 KB), and
dispatch view (7.2 KB / 2.5 KB). The Leaflet canvas remains a separate
156.4 KB / 45.7 KB chunk and is absent from the initial module-preload list.
The complete initial preload set, including the former React/vinext framework
runtime, was 335.7 KB raw / 107.5 KB gzip.

The 2026-07-28 order-history/review build keeps the detail request disabled
until an order is opened and adds no dependency or polling loop. The dynamically
loaded order-board chunk is 11.6 KB raw / 3.7 KB gzip; its shared order-domain
chunk is 2.9 KB / 1.3 KB. The Leaflet map remains isolated from both chunks.

The 2026-07-28 multi-image catalog build keeps the authenticated dashboard
shell at 6.9 KB raw / 2.3 KB gzip. The dynamically loaded catalog editor is
11.7 KB / 3.2 KB, plus its existing catalog-mutation chunk at 1.5 KB / 0.6 KB.
The added local form state creates no polling or background request; media
uploads start only when an administrator saves the dish.

The 2026-08-17 variant catalog build keeps both affected workflows lazy. The
catalog editor chunk is 23.6 KB raw / 5.8 KB gzip and the phone-assisted order
chunk is 21.8 KB raw / 6.7 KB gzip. Variant selection reuses the cached catalog
query, adds no polling, and uploads variant images only when the admin saves the
product.

The 2026-07-30 pure React/Vite migration removes Next.js, vinext, RSC,
hydration, and the Node frontend runtime. The static SPA bootstrap is 199.9 KB
raw / 63.1 KB gzip, with 60.4 KB / 17.0 KB gzip of CSS. Dashboard sections
remain split, and the Leaflet canvas remains a separate 156.4 KB / 46.1 KB
gzip chunk. The server container uses unprivileged Nginx with a 64 MB
production memory limit.

The 2026-08-02 multi-branch build keeps the static SPA bootstrap at 199.9 KB
raw / 63.1 KB gzip. Branch management is a separate 6.2 KB / 2.4 KB gzip
chunk, its location picker is 2.3 KB / 1.1 KB gzip, the order board is 12.9 KB
/ 4.1 KB gzip, and the shared Leaflet canvas remains isolated at 153.3 KB /
44.9 KB gzip. Branch management and Leaflet are absent from the initial
bootstrap and introduce no additional polling loop.

The 2026-08-02 React Hook Form/Zod build keeps the static SPA bootstrap at
200.0 KB raw / 63.1 KB gzip and does not add the form runtime to the initial
module-preload list. The shared form runtime is 99.3 KB / 29.5 KB gzip and is
loaded only when an actual form-bearing flow is opened. Domain form chunks
remain independently split with their existing widgets.

The 2026-08-02 self-hosted OpenStreetMap build changes only the compile-time
tile endpoint. The static SPA bootstrap remains 200.0 KB raw / 63.1 KB gzip,
and the separately loaded Leaflet chunk remains 153.3 KB / 44.9 KB gzip. It
adds no browser dependency, request loop, or initial module preload.

The 2026-08-02 Colorful/height adjustment changes CSS and runtime map assets
only: it adds no frontend dependency, polling loop, or JavaScript to the initial
bundle. Road-route calculation is server-side and does not add admin runtime
code.

The 2026-08-02 authenticated SSE build keeps the static SPA bootstrap unchanged
at 200.0 KB raw / 63.1 KB gzip. The shared courier entity chunk is 2.3 KB /
1.2 KB gzip and the dispatch view is 7.4 KB / 2.6 KB gzip; the separate Leaflet
chunk remains 153.4 KB / 44.9 KB gzip. SSE updates the existing TanStack Query
cache and adds no competing poll or initial preload.

The 2026-08-02 adaptive courier-route build measures the static SPA bootstrap
at 200.0 KB raw / 63.1 KB gzip and CSS at 62.3 KB / 17.4 KB gzip. The dispatch
view is 8.3 KB / 2.9 KB gzip, its lazy courier-map canvas is 3.7 KB / 1.6 KB
gzip, and the shared Leaflet chunk remains isolated at 153.4 KB / 44.9 KB gzip.
GPS SSE invalidates only the selected courier's TanStack route query and adds
no new polling loop or initial preload.

The 2026-08-02 responsive admin build keeps the static SPA bootstrap at
200.0 KB raw / 63.1 KB gzip and the isolated Leaflet chunk at 153.4 KB /
44.9 KB gzip. CSS is 66.8 KB / 18.1 KB gzip, an increase of about 4.5 KB raw /
0.7 KB gzip for responsive data-card, navigation and overflow rules. The order
board remains a separate 13.3 KB / 4.3 KB gzip chunk. No dependency, polling
loop or initial JavaScript was added.

The 2026-08-02 notification build keeps the static SPA bootstrap at 200.0 KB
raw / 63.1 KB gzip and adds the notification manager only as a lazy 8.0 KB /
3.1 KB gzip chunk. CSS is 68.6 KB / 18.4 KB gzip. The screen reuses the existing
form and TanStack chunks, performs no request before an authorized admin opens
it, and polls every three seconds only while a visible campaign is `PENDING` or
`SENDING`; terminal history has no background polling.

The 2026-08-08 assisted-order build measures the static SPA bootstrap at
203.3 KB raw / 63.8 KB gzip and CSS at 87.4 KB / 22.1 KB gzip. The order board
remains a separate 17.3 KB / 5.2 KB gzip chunk. The phone-order flow is loaded
only after an authorized operator opens it (18.8 KB / 5.7 KB gzip); its marker
picker is another 1.3 KB / 0.7 KB gzip chunk and the shared Leaflet runtime
remains isolated at 153.4 KB / 44.9 KB gzip. Address/customer search has no
keystroke autocomplete or polling loop; requests happen only on explicit submit.

The 2026-08-08 A7-tagam brand build keeps the SPA bootstrap at 203.4 KB raw /
63.8 KB gzip. CSS is 93.7 KB raw / 21.1 KB gzip after consolidating every UI
color into three palette tokens and their blends. The in-app/fav icon is a
14 KB WebP; the 940 KB PNG master is reserved for download and social metadata.
No dependency, polling loop, or route preload was added.

The 2026-08-15 assisted-address UX build keeps the static SPA bootstrap at
203.3 KB raw / 63.7 KB gzip. CSS is 97.8 KB / 21.6 KB gzip. The lazy assisted
order chunk is 20.5 KB / 6.2 KB gzip, its map picker is 2.1 KB / 1.1 KB gzip,
and Leaflet remains isolated. The increase covers the accessible listbox,
keyboard handling, explicit map loading state and modal resize correction. It
adds no dependency, keystroke autocomplete, polling loop or initial preload.

The 2026-08-15 Sites retirement keeps the same browser payload: the static SPA
bootstrap is 203.3 KB raw / 63.7 KB gzip and CSS is 97.8 KB / 21.6 KB gzip.
Cloudflare Vite, Wrangler, Worker and platform-specific build output were
removed from the development dependency tree. Vite now emits only
`dist/client`, which the existing unprivileged Nginx image serves with SPA
fallback; no browser runtime or request behavior changed.

The 2026-08-15 role-aware Kanban build keeps the static SPA bootstrap at
203.3 KB raw / 63.7 KB gzip. The lazy order-board chunk is 25.5 KB / 6.8 KB
gzip, an increase of about 5.0 KB raw / 0.6 KB gzip for lanes, role-minimized
cards, view switching, and real workflow actions. CSS is 103.3 KB / 22.4 KB
gzip, an increase of about 5.5 KB raw / 0.8 KB gzip for the responsive
three/two/one-column board. It adds no dependency or polling loop: the active
view keeps one existing 12-second TanStack Query observer, with a server-side
multi-status filter ensuring cook/courier queues are not displaced by history.

## Decision log

- 2026-07-27: media moved to private S3-compatible storage.
- 2026-07-27: OTP moved from PostgreSQL to atomic Redis storage; an initial
  third-party SMS adapter was added and later removed after the Android gateway
  became the sole production provider.
- 2026-07-27: multiple saved addresses added; last created/used address becomes
  active.
- 2026-07-27: `SUPER_ADMIN` added; trusted staff may cancel
  `SENT_TO_KITCHEN`, but nobody may cancel from `COOKING`.
- 2026-07-27: frontend target set to FSD + TanStack Query + TanStack Table,
  based on lessons from the NEM app without copying its older dependency
  versions or mobile-only persistence.
- 2026-07-27: frontend performance became an explicit release contract;
  optimize with measured React/TanStack techniques instead of blanket
  memoization.
- 2026-07-27: courier GPS updates were set to a two-minute client interval;
  latest points live in Redis, dispatch access is limited to trusted operations
  roles, and the first real FSD/TanStack frontend slices were introduced for
  courier tracking and the map.
- 2026-07-28: the demo admin was replaced with a protected, backend-integrated
  FSD dashboard for orders, kitchen, dispatch map, catalog/S3 media, banners,
  promos, staff, and cash reconciliation. A secured staff-creation endpoint was
  added, Swagger response contracts became explicit, and browser CORS now
  permits courier GPS `PUT` requests.
- 2026-07-28: product media was formalized as an ordered set of up to 10 private
  S3-backed WebP images, with the first image acting as the primary catalog
  image and matching validation in the API and admin.
- 2026-07-28: CI/CD was defined as deny-on-failure GitHub Actions checks,
  Swagger contract drift detection, immutable GHCR API/migration images with
  provenance and SBOM, and an optional protected-environment Linux deployment.
  The static Nginx admin image is deployed with the same VDS release.
- 2026-07-28: production OTP delivery moved to a dedicated Android SIM gateway
  using authenticated HTTPS pull, encrypted Redis jobs, atomic leases,
  delivery receipts, heartbeat/offline rejection, bounded retry, and
  request-specific OTP cancellation.
- 2026-07-29: branch-based backend delivery was defined as
  `develop → development` and `main → production`, using isolated server
  directories, Compose projects, ports, databases, Redis, S3, secrets, GitHub
  Environments, pre-deploy migrations, health checks, and digest rollback.
- 2026-07-29: Ayterek (`map.ayterek.com`) was considered as the production map
  provider. Its public page URL is not a tile endpoint and remains unused until
  an official raster tile or MapLibre style contract is supplied.
- 2026-08-02: local development moved to a self-hosted OpenStreetMap base map.
  A separate hardened TileServer GL container renders Leaflet-compatible PNG
  tiles from the daily Turkmenistan Shortbread MBTiles extract with local
  VersaTiles style, sprites, and fonts. It has no runtime dependency on public
  OSM tile servers and does not include geocoding or route planning.
- 2026-08-02: the self-hosted base map became an independently deployable
  shared web/mobile service. MapLibre vector style is the preferred mobile
  contract and PNG remains a Leaflet compatibility output of the same server.
  Courier GPS continues to enter only through the authenticated API; true live
  dispatch requires 10–15-second active-delivery publishing and server-pushed
  authorized marker updates. Straight-line pseudo-routes were removed.
- 2026-08-02: courier route planning became an accepted backend capability.
  A private, digest-pinned OSRM MLD service builds routes from the same regional
  OpenStreetMap source; NestJS combines current courier GPS, unique branch
  pickups, and every assigned delivery, then returns normalized GeoJSON,
  distance, duration, legs, and maneuvers. Clients never access OSRM directly,
  and assigned stops remain visible if routing is unavailable. The shared map
  style moved from pale Neutrino to local VersaTiles Colorful and map canvases
  received larger responsive heights.
- 2026-08-02: live dispatch moved from polling-only updates to an authenticated
  SSE stream. Courier GPS still enters through the role-protected NestJS
  endpoint and Redis remains the latest-point store; accepted/stopped location
  events contain only courier ID and GPS data and update the existing TanStack
  Query snapshot cache. Active-delivery clients now receive a 15-second update
  recommendation; periodic polling remains a recovery path, not a second
  competing live-state owner.
- 2026-08-02: courier and dispatch route views converged on one authoritative
  response. Every active order remains in `stops`, the next three operational
  waypoints are exposed separately, and a deterministic `planId` identifies the
  shared road geometry. Fresh GPS invalidates the selected admin route for
  15-second adaptive recalculation. The self-hosted OSRM graph does not provide
  live closures/traffic; integrating a trusted dynamic-restriction source is a
  separate future backend capability.
- 2026-08-02: branch management gained a lazy-loaded interactive location
  picker. A map click or marker drag stores validated latitude/longitude at the
  persisted seven-decimal precision. Manual coordinate inputs and the provider
  homepage link are intentionally absent from the branch form; only the direct
  tile template and its attribution are build-time settings.
- 2026-08-02: every React admin form standardized on React Hook Form with
  colocated Zod schemas and shared validation helpers. Zod handles input
  normalization and client feedback, while NestJS remains authoritative for
  permissions and business invariants. Multipart FormData is limited to the S3
  image upload transport.
- 2026-07-29: API and admin were physically consolidated under `apps/`, with
  generated Swagger types in `packages/api-contract`, one Docker/CI/CD flow,
  and one GitHub pull-request lifecycle. API and admin intentionally retain
  independent npm lockfiles so security overrides, audits, and Docker builds
  stay isolated and reproducible.
  The canonical repository is `Guvanch99/alowalow`; the old admin repository
  is archived after the monorepo push is verified. Android stays separate.
- 2026-07-30: the first accepted target was a shared Ubuntu host. That plan used
  HTTPS port `8443`, loopback ports `3001`/`4001`, and an isolated
  `/opt/alowalow/development` directory. It was superseded on 2026-08-14 before
  the application was deployed there; the other project and its ports were not
  changed.
- 2026-07-30: the admin deployment was corrected to pure React/Vite SPA.
  Next.js, vinext, React Server Components, SSR, hydration, and the Node
  frontend server were removed. Browser routes use Nginx static index fallback.
- 2026-08-02: the unused Twilio fallback and its credentials were removed.
  Production OTP delivery is Android pull only; local development keeps the
  non-delivering console mode.
- 2026-08-06: a single-device LAN development mode may use the Android pull
  gateway without a bearer token when `SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL`
  is explicitly enabled. The flag is rejected outside development. This local
  exception was later supplemented by the explicitly accepted temporary
  production integration mode documented on 2026-08-19.
- 2026-08-02: multi-branch operations replaced the deployment-level dispatch
  configuration. Admins manage PostgreSQL-backed branches, every new order is
  routed to the nearest active branch and stores an immutable branch snapshot,
  order lists can filter by branch, and dispatch maps show all branch
  points. The global catalog remains shared across branches. No active branch
  is a fail-closed `409` condition.
- 2026-08-02: admin data lists gained one shared responsive TanStack Table
  presentation. Order rows switch to labelled two-column cards on constrained
  operations screens, all tables switch to one-column cards on phones, and
  catalogue/marketing tables use full-width sections. Mobile navigation uses
  a fixed three-column grid and cash-status tabs stack vertically, so neither
  requires a nested horizontal scrollbar.
- 2026-08-02: customer push notifications became a durable backend capability.
  `ADMIN`/`SUPER_ADMIN` create immediate all-customer campaigns, PostgreSQL
  stores customer inbox and per-device delivery results, and a restart-safe
  worker sends through FCM in batches. Mobile devices register current FCM
  registration tokens against the existing customer JWT; Firebase Auth is not
  used. The lazy FSD admin screen uses the generated Swagger contract and polls
  only while a visible campaign is pending or sending.
- 2026-08-08: operator-assisted phone orders became a first-class API and lazy
  admin workflow. `OPERATOR`/`ADMIN` may resolve or create a caller by phone
  without issuing a session, choose dishes and a saved/new address, and submit
  a `STAFF_PHONE` cash order through the same backend pricing, promo, nearest
  branch, address activation, immutable snapshots, and audit logic used by the
  customer flow. Address lookup is explicit-submit server-side geocoding with
  a manual unofficial-landmark and draggable-map fallback; public Nominatim is
  rate-limited/cached and its endpoints are replaceable through environment.
- 2026-08-15: the closed-network DEV address search moved to a private pinned
  Nominatim 5.3 container using the existing Turkmenistan PBF and a persistent
  PostgreSQL index volume. The assisted-order search now renders an accessible
  keyboard-selectable dropdown, the map invalidates its size inside the modal,
  and the manual unofficial landmark is optional because an exact marker can
  provide the persisted coordinate fallback.
- 2026-08-08: the customer-facing brand changed to `A7-tagam`. The React admin
  uses the supplied hot-food delivery-bag logo for login, navigation, courier,
  favicon, and social metadata. Its visual system is restricted to the logo's
  cream, navy, and orange palette plus blends derived only from those colors;
  stable technical identifiers named `alowalow` remain unchanged.
- 2026-08-14: DEV moved to the dedicated VDS `216.250.12.132` with 4 vCPU,
  4 GB RAM and 60 GB SSD. One full stack runs under the isolated Compose project
  and directory `/opt/alowalow/development`: API, static admin, PostgreSQL,
  TLS-Redis, MinIO, TileServer GL and private OSRM. Nginx owns standard ports
  `80`/`443`; application and tile
  upstreams remain loopback-only and OSRM remains Docker-internal. A 2 GB swap
  is recommended for image updates and map-rendering peaks. Production remains
  disabled and requires a separate host or explicit capacity/security review.
- 2026-08-14: the VDS egress audit found Ubuntu APT, GitHub, GHCR and Telecom
  Nexus available, while public Docker Hub, PyPI and Snap CDN are unreachable.
  Pinned third-party images retain their source digest and are pulled through
  the anonymous `nexus.telecom.tm` Docker proxy; the available npm proxy is not
  needed because no Node build runs on the server. Repository-owned images use
  a job-scoped `GITHUB_TOKEN` for SSH-stdin Docker login followed by logout, so
  no persistent registry token or server VPN is required. Certbot 5.7 runs from
  an isolated offline wheel installation under `/opt/alowalow/tools`.
- 2026-08-14: because the VDS cannot reach the Let's Encrypt ACME API, IP
  certificate issuance and renewal run outside the server. A pinned Certbot
  client in GitHub Actions uses validated SSH auth/cleanup hooks to publish only
  the HTTP-01 token, keeps canonical ACME account/certificate state under
  `/opt/alowalow/acme-state`, and checks every 12 hours. Nginx reloads only
  after the renewed state is transferred and its configuration passes.
- 2026-08-15: the pinned Redis image is forced to its upstream non-root
  `999:1000` identity. This lets Redis traverse the host TLS directory through
  its numeric group while `cap_drop: ALL`, the directory's `750` mode and the
  host-only CA key remain intact. Host preparation also persists Redis's
  recommended `vm.overcommit_memory=1` sysctl.
- 2026-08-15: two Let's Encrypt staging attempts reached the VDS successfully
  from two and then three validation perspectives, while one secondary
  perspective consistently received `connection refused`. Trusted IP HTTPS is
  therefore not marked ready: the HTTP-only ACME bootstrap stays active and
  scheduled renewal stays gated off until Telecom fixes international port-80
  reachability and the first production certificate is installed.
- 2026-08-15: the temporary release flow was simplified for the initial
  customer-testing period. `main` is the only active integration branch and
  deploys production-mode images to the single `development` VDS after every
  successful quality gate. No separate `develop` or staging environment is
  maintained yet. When a second server is provisioned, branch/environment
  separation must be introduced explicitly before production launch.
- 2026-08-15: GitHub-hosted runners cannot reach the VDS SSH service through
  Telecom on port `22`, while the server must remain VPN-free. The same hardened
  sshd therefore listens temporarily on both `22` and `443`; deploy jobs use a
  validated `DEPLOY_SSH_PORT=443`, short connection timeouts, the verified host
  key and the job-scoped GHCR token. Port `443` must be returned to Nginx and
  the deploy transport reviewed before trusted public HTTPS is enabled.
- 2026-08-15: the ordered canonical origin is
  `https://a7-tagam.com.tm`. Turkmen Telecom, not Let’s Encrypt, supplies and
  renews its SSL certificate for the domestic-only service. Nginx serves the
  React admin at `/`, NestJS and media at `/api/v1`, Swagger at `/docs`, and the
  shared map at `/tiles`; private OSRM remains backend-only. The repository
  prepares conventional certificate paths under
  `/etc/nginx/ssl/a7-tagam.com.tm`, but activation waits for Telecom’s actual
  certificate paths and renewal ownership. The previous ACME workflow remains
  disabled.
- 2026-08-15: access and refresh lifetimes were set to 365 days by explicit
  product decision. Newly issued access JWTs are session-bound with `sid`; the
  guard checks the current active user and unrevoked, unexpired PostgreSQL
  session on every protected request. Refresh rotation or logout therefore
  invalidates the related year-long access token immediately.
- 2026-08-15: while Turkmen Telecom prepares DNS and SSL for
  `a7-tagam.com.tm`, the customer explicitly authorized temporary plain HTTP
  access on `216.250.12.132` for domestic testing. The temporary Nginx gateway
  proxies the admin, API, Swagger and tiles through one origin and advertises
  `X-A7-Temporary-HTTP: true`. It is an accepted short-lived exception only:
  browser geolocation is unavailable and credentials are not transport-secure.
  HTTP and HTTPS configurations remain versioned side by side, with exactly one
  site enabled at a time. The temporary Swagger location preserves Helmet's CSP
  except for `upgrade-insecure-requests`, which would otherwise upgrade its
  assets before TLS exists and render a blank page. Telecom also resets plain
  HTTP asset requests whose path contains the literal word `runtime`, so the
  Vite production build emits opaque `chunk-<hash>.js` filenames. Admin API and
  map URLs stay relative (`/api/v1` and `/tiles`), allowing the exact build to
  move from the temporary HTTP origin to the final HTTPS origin. Nginx rewrites
  TileServer-generated `localhost` references inside JSON map contracts to the
  current same-origin `/tiles` base; binary raster/vector tile payloads remain
  untouched. The temporary site must be removed and port 80 redirected to
  HTTPS as part of Telecom certificate activation.
- 2026-08-15: the customer explicitly requested a reusable one-year test OTP
  for one admin phone during customer testing. The exception is server-env
  configured, expires within 366 days, is allowed only when
  `DEPLOYMENT_ENVIRONMENT=development`, and never bypasses request throttling or
  the fresh one-time 5-minute Redis challenge. Production deployment validation
  rejects the exception; every other number continues through Android SMS.
- 2026-08-15: ChatGPT Sites was retired as an admin deployment target by
  explicit product decision. Its repository binding, Cloudflare Worker,
  Wrangler dependencies and CI artifact metadata were removed. The admin is a
  static React/Vite SPA deployed only as the Nginx image in the VDS release;
  no Sites project may be created, updated or published without a new explicit
  product decision.
- 2026-08-15: the deployed topology, GitHub Environment settings, secret
  boundaries, public URLs, persistent data, release flow, recovery commands and
  production-readiness gaps were consolidated in `docs/INFRASTRUCTURE.md`.
  Infrastructure tasks must update that inventory without recording secret
  values; `README.md` was corrected to the then-active
  `main → development VDS` flow.
- 2026-08-15: the customer superseded the temporary DEV-labelled deployment
  decision. `main` is now the only active branch and deploys directly to the
  GitHub `production` Environment and `/opt/alowalow/production` Compose stack.
  The active runtime uses `DEPLOYMENT_ENVIRONMENT=production`, production image
  tags, ports `4000`/`3000`, and no long-lived OTP exception. A future DEV must
  be built as separate infrastructure with its own environment, directory,
  Compose project, ports, data and secrets; it is not active now.
- 2026-08-15: the customer selected a single raster XYZ base-map contract for
  both the Leaflet admin and mobile applications:
  `/tile/{z}/{x}/{y}.png`. Host Nginx maps it to the private TileServer GL
  `alowalow` PNG style backed by the Turkmenistan-only extract. Mobile does not
  need `style.json`; JSON/vector endpoints remain optional and backward
  compatible. Courier/order/GPS data and OSRM routes still come only from the
  authenticated NestJS API and are rendered above the raster background.
- 2026-08-15: order operations gained a role-aware Kanban as the default view.
  Operator/accountant/admin roles can observe the whole lifecycle, cooks and
  couriers receive only their operational lanes, and order cards minimize
  unrelated personal and financial fields by role. Operator/admin roles retain
  the detailed table switch; the courier screen combines GPS sharing with every
  backend-scoped assigned order. All actions reuse the versioned NestJS order
  mutations, while backend guards remain authoritative. The order list gained
  a backward-compatible validated `statuses` query for one-request role queues.
  Search and role constraints are composed with `AND`, preventing a cook search
  from overriding the server visibility scope.
- 2026-08-18: customer testing gained a narrowly scoped production OTP
  exception for two env-only allowlisted numbers through 2026-09-17. The
  reusable value is never committed, production requires an explicit
  acknowledgement, the expiry is capped at 32 days, and every use retains the
  normal request cooldown, hourly limit, five-minute Redis challenge,
  five-attempt limit and one-time consumption. After expiry, Android SMS is
  automatically authoritative again. Because the hardened host no longer
  accepts its bootstrap password, the three temporary values are delivered by
  the existing protected GitHub `production` deploy key from encrypted
  Environment secrets into the mode-600 VDS env; the workflow never prints or
  includes them in images. The originally planned 2026-09-18 expiry was moved
  one day earlier after the VDS was found approximately two days behind with
  NTP enabled but unsynchronized; the shorter date preserves the production
  32-day safety cap until Telecom-reachable time synchronization is fixed.
- 2026-08-18: external catalog seed import gained a repository-owned strict
  dry-run/apply CLI. It validates the complete JSON and referenced WebP set,
  uploads S3 objects before a serializable idempotent database transaction,
  preserves existing variants, records an audit event, and requires a
  production backup. The initial package's old visible `AlowAlow` brand is
  normalized to `A7-tagam`; placeholder banner text and foreign/test links are
  removed instead of publishing them.
- 2026-08-19: at the customer's explicit request, the Android SMS gateway's
  `heartbeat`, `pull`, and delivery-status endpoints temporarily became
  tokenless in production to unblock the single-phone integration.
  `SMS_GATEWAY_AUTH_REQUIRED=false` is the current default, Swagger no longer
  advertises a device bearer requirement, and user access/refresh JWTs are not
  involved. The existing constant-time bearer guard and device secret remain
  ready; changing the flag to `true` restores the protection without an API
  payload change. This accepted exception exposes OTP jobs and their status
  mutation to every client with network access and must be removed after the
  mobile integration is complete.
- 2026-08-19: the Telecom-issued Sectigo certificate for `a7-tagam.com.tm` and
  `www.a7-tagam.com.tm` was validated against its CA bundle and matching private
  key, then activated on the production VDS. Nginx now owns 443 and serves the
  admin, API, Swagger and map through one HTTPS origin; port 80 permanently
  redirects to it. SSH returned to port 22 only, and GitHub deployment metadata
  was updated accordingly. The certificate expires on 2027-03-05; Telecom owns
  renewal issuance and A7-tagam operations owns validation/installation. During
  activation, Chrony reported a valid reference while the system clock was
  120,495 seconds slow; the clock and RTC were stepped to the trusted NTP time
  before TLS verification. GitHub-hosted runners still cannot reach domestic
  SSH port 22, so unattended deploy requires a domestic self-hosted runner or
  another Telecom-approved transport and must never reclaim HTTPS port 443.
- 2026-08-20: the operations admin gained one global, role-scoped new-order
  alert loop for `OPERATOR`, `ADMIN`, and `SUPER_ADMIN`. It polls the real
  active kitchen/ready order queue every 30 seconds only while the document is visible,
  establishes the first response as a quiet baseline, deduplicates by backend
  order ID, always shows an in-app alert, and optionally uses the browser
  Notification API after an explicit user gesture. Existing order-board polling
  uses the same 30-second cadence. Tablet and phone navigation converged on one
  off-canvas drawer through 1180 px, hidden drawers cannot intercept taps, and
  coarse-pointer controls have a minimum 44 px touch target.
- 2026-08-20: new customer-app and phone-assisted orders began entering the
  kitchen queue immediately, with direct kitchen-to-ready support and no
  confirm/handoff buttons in the normal admin flow. Newly observed kitchen
  orders dispatch their receipt plan automatically from the operations
  workstation, and every printed chunk includes the online order number. A
  persisted, audited administrator packing confirmation—backed by an all-lines
  checklist—is now required before courier assignment.
- 2026-08-20: the order board was condensed from nine status columns to three
  operational columns (`kitchen`, `ready`, `courier`) plus one collapsed
  archive. Individual cards are expandable and every lane uses TanStack Virtual
  with stable backend order IDs and dynamic measurement, so queues of 50–100
  orders do not mount every detailed card. The board and table default to the
  current local calendar day, allow yesterday, an explicit historical date, or
  all history, and support an hour range within the selected day. NestJS owns
  the inclusive `createdFrom` and exclusive `createdTo` filtering and composes
  it with role, status, branch, and search constraints.
- 2026-08-20: the operations admin replaced local-state tab switching with
  canonical React Router browser routes. `/` redirects to `/orders`; every
  management section supports direct loading, bookmarkable URLs and browser
  back/forward navigation, while the shared authenticated layout and
  role-scoped sidebar remain mounted. Direct access to a role-forbidden section
  redirects to the role's default allowed route, and Nginx continues to serve
  all browser routes through the static SPA entry document.
- 2026-08-21: the controlled catalog importer gained per-product private LAN
  receipt-printer routing, optional variant synchronization, and an explicit
  atomic replacement mode. Replacement soft-disables unlisted
  products/categories instead of deleting rows, so old order references remain
  valid; banners are unchanged and production still requires a verified backup
  plus dry-run before apply.
