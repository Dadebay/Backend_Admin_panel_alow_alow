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
│   ├── features/          # user actions and mutations
│   ├── entities/          # domain UI, types, queries, table columns
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

## Frontend status and target

Current status:

- the admin visual prototype exists;
- Swagger schema and a basic fetch client exist;
- the main dashboard still uses local demo arrays and is not fully connected to
  backend queries;
- TanStack Query and TanStack Table are not installed yet.

Accepted target:

- refactor the admin to FSD layers;
- TanStack Query owns server state and mutations;
- TanStack Table owns admin list/table behavior;
- generated OpenAPI types are the API contract;
- route files remain thin and business behavior moves into entities, features,
  and widgets.

Never report the admin as fully backend-connected until demo arrays have been
removed and critical workflows pass integration tests against NestJS.

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
