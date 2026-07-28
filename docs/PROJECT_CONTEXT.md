# AlowAlow durable project context

Update this file whenever an accepted requirement or architectural decision
changes. It is intentionally concise and should be read before every task.

## Product

AlowAlow is a cash-on-delivery food ordering platform for Ashgabat with:

- a NestJS API;
- a React/Next.js operations admin;
- customer-facing API capabilities for phone login, addresses, catalog,
  ordering, promos, and ratings;
- role-specific operations for kitchen, dispatch, courier, cash receipt, and
  accounting.

The private Sites URL publishes the admin frontend only. The NestJS backend is
currently a local/deployable service and still needs a production runtime,
managed PostgreSQL, TLS Redis, S3, SMS credentials, and a maps provider.

## Stack and storage

- NestJS 11, Prisma 7, PostgreSQL 18.
- Redis 8 for temporary OTP challenges and rate controls.
- Twilio adapter for production SMS; console provider in development.
- Private S3-compatible object storage; MinIO locally.
- React 19, Next.js 16/vinext, Swagger/OpenAPI-generated TypeScript schema.
- Local Docker services: PostgreSQL, Redis, MinIO.

Durable business data belongs in PostgreSQL. Temporary OTP data belongs in
Redis. Images belong in S3-compatible storage.

## Repository structure

This is the target structure and an architectural contract. When a task adds or
moves a major module, update this tree in the same change.

```text
alowalow/
├── AGENTS.md
├── docs/
│   └── PROJECT_CONTEXT.md
├── api/
│   ├── AGENTS.md
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── auth/          # OTP, JWT, refresh sessions, SMS
│   │   ├── users/         # staff and customer addresses
│   │   ├── catalog/       # categories and products
│   │   ├── marketing/     # banners and promo codes
│   │   ├── media/         # S3-compatible image storage
│   │   ├── orders/        # workflow, assignment, route, rating, cash
│   │   ├── tracking/      # courier GPS ingestion and dispatch map snapshot
│   │   ├── common/        # guards, decorators, shared HTTP types
│   │   ├── config/        # validated environment configuration
│   │   ├── prisma/        # Prisma service/module
│   │   ├── redis/         # Redis infrastructure adapter
│   │   └── generated/     # generated Prisma client; never edit manually
│   └── test/              # unit and isolated HTTP e2e tests
├── app/                   # Next.js routes, layouts, and provider composition
│   ├── AGENTS.md
│   └── lib/               # temporary generated schema/client location
├── src/                   # target React/FSD product layers
│   ├── widgets/           # composed admin sections
│   │   ├── admin-dashboard/
│   │   ├── order-board/
│   │   ├── dispatch-map/
│   │   ├── catalog-manager/
│   │   ├── marketing-manager/
│   │   ├── staff-manager/
│   │   └── cash-board/
│   ├── features/          # order/catalog/marketing/staff mutations
│   ├── entities/          # order, courier, catalog, marketing, staff queries
│   └── shared/
│       ├── api/           # generated contract, HTTP/query clients, keys
│       ├── ui/            # reusable primitives
│       ├── config/
│       └── lib/
├── docker-compose.yml     # PostgreSQL, Redis, MinIO for local development
└── .openai/hosting.json   # existing private admin frontend deployment
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
  receives returned cash, and may cancel before cooking starts.
- `COOK`: accepts `SENT_TO_KITCHEN` orders and marks them `COOKING`/`READY`.
- `COURIER`: handles only assigned orders and returns collected cash.
- `ACCOUNTANT`: performs final cash reconciliation.
- `ADMIN`: operational administration and full order workflow control.
- `SUPER_ADMIN`: owner-level administrator with all admin access and protected
  authority over the `SUPER_ADMIN` role.

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
one-active-order rule. The courier route contains every assigned active stop
with address, coordinates, customer, item count, and cash amount. Individual
orders progress independently.

The courier web client publishes its own GPS reading immediately after the
courier starts sharing and then every 120 seconds. Only the authenticated
`COURIER` may publish or delete their own current point. The latest point is
ephemeral operational data in Redis with a 15-minute TTL; it is `ONLINE` for
five minutes, then `STALE` until expiry. The dispatch snapshot is restricted to
`OPERATOR`, `ADMIN`, and `SUPER_ADMIN` and includes each active courier, latest
location, all active assigned orders, delivery coordinates, customer contact
details, items, and cash to collect.

The pickup point is deployment configuration
(`DISPATCH_PICKUP_NAME`, address, latitude, and longitude). Both pickup
coordinates must be configured together. Until a production maps/tile provider
is selected, the frontend uses a configurable Leaflet tile URL with
OpenStreetMap tiles as the local-development default.

## Customer and payment behavior

- Login/registration is by phone OTP. First and last name are optional.
- OTP TTL is 5 minutes, resend cooldown 60 seconds, maximum 5 sends/hour and
  5 verification attempts. Successful verification is atomic and one-time.
- A user may store up to 20 addresses.
- A newly created or selected address becomes active.
- The address used by the latest order becomes the active/default address.
- Orders keep an immutable snapshot of address and product price/name data.
- Payment method is currently `CASH` only.
- Courier returns cash to operator; operator confirms receipt; accountant
  reconciles.
- Customer may submit one rating/comment after delivery.

## Catalog and marketing

Admins control categories, products, descriptions, active status, images,
banners, and promo codes. Images are validated, converted to WebP, and stored
privately in S3-compatible storage. Product availability, current price, promo
limits, discount, delivery fee, and final total are validated by the backend.

A product may have up to 10 ordered images. Product image references must be
WebP paths returned by the media API, and the first image is the primary
catalog image. Admin product create/update may replace the ordered image set;
the backend enforces the same limit for the single-image compatibility
endpoint.

## Frontend status and target

Current status:

- the protected admin dashboard has no local demo arrays;
- orders, kitchen workflow, courier assignment, cash workflow, catalog,
  banners, promos, and staff read/write through the NestJS API;
- order details show the real status timeline plus the customer's five-star
  rating and comment returned by the API;
- the dispatch map and courier GPS-sharing screen use Redis-backed tracking;
- media forms upload validated WebP images to S3-compatible storage;
- the catalog editor creates and updates a dish with category, name, slug,
  description, price, availability, ordering, and up to 10 S3 images;
- Swagger response DTOs generate the TypeScript contract used by the frontend;
- TanStack Query owns server state and TanStack Table renders admin lists;
- heavy management sections and the Leaflet map are dynamically split.

Accepted target:

- refactor the admin to FSD layers;
- TanStack Query owns server state and mutations;
- TanStack Table owns admin list/table behavior;
- generated OpenAPI types are the API contract;
- route files remain thin and business behavior moves into entities, features,
  and widgets;
- React Server Components are the default for static composition, with small
  client boundaries for interactive features;
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
The complete initial preload set, including React/vinext framework runtime, is
335.7 KB raw / 107.5 KB gzip.

The 2026-07-28 order-history/review build keeps the detail request disabled
until an order is opened and adds no dependency or polling loop. The dynamically
loaded order-board chunk is 11.6 KB raw / 3.7 KB gzip; its shared order-domain
chunk is 2.9 KB / 1.3 KB. The Leaflet map remains isolated from both chunks.

The 2026-07-28 multi-image catalog build keeps the authenticated dashboard
shell at 6.9 KB raw / 2.3 KB gzip. The dynamically loaded catalog editor is
11.7 KB / 3.2 KB, plus its existing catalog-mutation chunk at 1.5 KB / 0.6 KB.
The added local form state creates no polling or background request; media
uploads start only when an administrator saves the dish.

## Decision log

- 2026-07-27: media moved to private S3-compatible storage.
- 2026-07-27: OTP moved from PostgreSQL to atomic Redis storage; Twilio SMS
  adapter added.
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
