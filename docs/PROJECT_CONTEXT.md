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

The private Sites URL publishes the static admin frontend only. The NestJS
backend is currently a local/deployable service. CI/CD produces immutable API,
migration and static Nginx admin images. The accepted dedicated VDS target is
`216.250.12.132` (4 vCPU, 4 GB RAM, 60 GB SSD) and hosts one full DEV stack,
including TileServer GL and private OSRM. Production remains disabled until it
receives a separate host or an explicit capacity review.

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
  isolated TileServer GL container shared by web and mobile clients. MapLibre
  style/vector tiles are the canonical mobile contract; raster PNG tiles exist
  only for current Leaflet compatibility.
- A private OSRM driving engine built from the Turkmenistan OpenStreetMap
  extract. NestJS is its only consumer and exposes normalized, authorized
  courier routes; mobile clients never call OSRM directly.
- A server-side geocoding adapter provides explicit Turkmenistan place search
  and reverse geocoding. Provider origins are environment-configurable;
  low-volume development defaults to Nominatim with Photon fallback, bounded
  caching, and serialized primary-provider requests. Public Nominatim is never
  used for autocomplete.
- React 19, Vite 8, Swagger/OpenAPI-generated TypeScript schema.
- Local Docker services: PostgreSQL, Redis, MinIO.
- GitHub Actions CI/CD with GHCR API, migration and static admin images.
  During the initial customer-testing phase, `main` deploys production-mode
  builds to the single isolated `development` environment. A separate
  `develop` branch and production host are deferred; production automation
  remains deny-by-default and disabled.

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
│       ├── ci-cd.yml
│       └── development-certificate.yml
├── docs/
│   ├── ANDROID_SMS_GATEWAY.md
│   ├── DEPLOYMENT.md
│   ├── MOBILE_MAP_AND_ROUTING.md
│   ├── MOBILE_PUSH_NOTIFICATIONS.md
│   └── PROJECT_CONTEXT.md
├── deploy/
│   ├── nginx/
│   │   ├── alowalow-acme-bootstrap.conf
│   │   ├── alowalow-acme-location.conf
│   │   ├── alowalow-http-temporary.conf
│   │   └── alowalow-development.conf
│   ├── compose.development.yml
│   ├── compose.production.yml
│   ├── certbot-remote-auth.sh
│   ├── certbot-remote-cleanup.sh
│   ├── development.env.example
│   ├── deploy-production.sh
│   ├── prepare-development-host.sh
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
│   └── admin/
│       ├── AGENTS.md
│       ├── Dockerfile     # static SPA image served by unprivileged Nginx
│       ├── index.html     # Vite browser entry document
│       ├── nginx.conf     # static assets, cache policy, SPA route fallback
│       ├── package-lock.json # isolated frontend dependency/security tree
│       ├── .openai/hosting.json # existing private Sites project
│       ├── src/            # FSD product layers
│       │   ├── app/        # SPA bootstrap, routes, providers, global styles
│       │   ├── widgets/    # boards/maps/managers, incl. assisted phone order
│       │   ├── features/   # typed mutations, incl. assisted order creation
│       │   ├── entities/   # typed queries/models, incl. customer/geocoding
│       │   └── shared/     # HTTP/query clients, auth, Zod form helpers, UI
│       ├── public/
│       ├── tests/
│       └── worker/         # static Sites asset adapter; never renders UI
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
- `OPERATOR`: confirms orders, sends them to kitchen, assigns couriers,
  receives returned cash, may cancel before cooking starts, and may create a
  cash order for a caller through the assisted-order API/admin form.
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

## Order state machine

```text
NEW
→ CONFIRMED
→ SENT_TO_KITCHEN
→ COOKING
→ READY
→ ASSIGNED_TO_COURIER
→ OUT_FOR_DELIVERY
→ DELIVERED
→ CASH_RETURNED
→ COMPLETED
→ RECONCILED
```

`CANCELLED` is terminal.

Role ownership:

- operator/admin: `NEW → CONFIRMED → SENT_TO_KITCHEN`;
- cook/admin: `SENT_TO_KITCHEN → COOKING → READY`;
- operator/admin assigns a `READY` order to an active courier;
- assigned courier/admin:
  `ASSIGNED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED → CASH_RETURNED`;
- operator/admin: `CASH_RETURNED → COMPLETED`;
- accountant/admin: `COMPLETED → RECONCILED`;
- `SUPER_ADMIN` inherits admin transitions.

Cancellation:

- customer owner: `NEW` only;
- `OPERATOR`, `ADMIN`, `SUPER_ADMIN`:
  `NEW`, `CONFIRMED`, `SENT_TO_KITCHEN`;
- no role may cancel once status is `COOKING` or later.

Every mutation uses the order `version` for optimistic concurrency and records
the successful transition.

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
  `GET /api/v1/internal/sms-gateway/pull` with its bearer device token and
  acknowledges `SENT`, `DELIVERED`, or `FAILED` using the returned lease
  receipt. Pulling itself refreshes the device heartbeat.
- OTP TTL is 5 minutes, resend cooldown 60 seconds, maximum 5 sends/hour and
  5 verification attempts. Successful verification is atomic and one-time.
- Outbound SMS jobs are AES-256-GCM encrypted in Redis, expire after the OTP,
  are claimed atomically, and are retried at most three times after missing
  acknowledgements. A final failure cancels only the matching OTP request.
- A user may store up to 20 addresses.
- A newly created or selected address becomes active.
- The address used by the latest order becomes the active/default address.
- Orders keep an immutable snapshot of address and product price/name data.
- An operator/admin phone order resolves an existing active customer by phone
  or creates a `CUSTOMER` record without issuing OTP, JWT, or refresh tokens.
  A staff phone number or inactive customer is rejected. Staff may reuse one
  of that customer's saved addresses or save a new map-selected address with
  an editable official/unofficial description. Every such order is marked
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

A product may have up to 10 ordered images. Product image references must be
WebP paths returned by the media API, and the first image is the primary
catalog image. Admin product create/update may replace the ordered image set;
the backend enforces the same limit for the single-image compatibility
endpoint.

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
  select active catalog items,
  perform an explicit OSM address search, edit an unofficial landmark, or put
  a draggable marker on the large map. TanStack Query owns all remote data,
  React Hook Form/Zod validate the form, and the backend computes the final
  amount and nearest branch;
- order details show the real status timeline plus the customer's five-star
  rating and comment returned by the API;
- the dispatch map and courier GPS-sharing screen use Redis-backed tracking;
  accepted locations reach authorized dispatchers immediately through SSE,
  with the 30-second snapshot poll retained only as reconnect recovery;
- media forms upload validated WebP images to S3-compatible storage;
- the catalog editor creates and updates a dish with category, name, slug,
  description, price, availability, ordering, and up to 10 S3 images;
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

The 2026-07-30 pure React/Vite migration removes Next.js, vinext, RSC,
hydration, and the Node frontend runtime. The static SPA bootstrap is 199.9 KB
raw / 63.1 KB gzip, with 60.4 KB / 17.0 KB gzip of CSS. Dashboard sections
remain split, and the Leaflet canvas remains a separate 156.4 KB / 46.1 KB
gzip chunk. The server container uses unprivileged Nginx with a 64 MB DEV
memory limit.

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
  The existing private Sites project remains the only admin hosting target.
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
  frontend server were removed. Browser routes use a static index fallback;
  the Sites Worker only forwards static assets and performs no rendering.
- 2026-08-02: the unused Twilio fallback and its credentials were removed.
  Production OTP delivery is Android pull only; local development keeps the
  non-delivering console mode.
- 2026-08-06: a single-device LAN development mode may use the Android pull
  gateway without a bearer token when `SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL`
  is explicitly enabled. The flag is rejected outside development; production
  Android gateway authentication remains mandatory.
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
  assets before TLS exists and render a blank page. The temporary site must be
  removed and port 80 redirected to HTTPS as part of Telecom certificate
  activation.
