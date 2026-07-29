# NestJS backend instructions

These rules apply to everything under `apps/api/` and extend the repository root
instructions.

## Architecture

- Organize code by business module: `auth`, `users`, `catalog`, `marketing`,
  `media`, and `orders`.
- Controllers handle HTTP concerns only: decorators, DTOs, status codes, and
  passing the authenticated actor to a service.
- Services own use cases, authorization details that depend on loaded data,
  transactions, and orchestration.
- Keep reusable policy decisions in explicit policy files such as
  `orders/order-policy.ts`.
- Prisma is the only application access layer for PostgreSQL. Do not introduce
  raw SQL except for a documented locking or database-specific requirement.
- External systems stay behind injectable services: Redis, Twilio, S3, and
  future maps/routing providers.

## API and validation

- Every request body, query, and path identifier must use a DTO or a Nest pipe.
- Keep global whitelist validation enabled; unknown fields must be rejected.
- Use Swagger decorators on public endpoints and DTO properties.
- Return stable domain errors with Nest exceptions; never leak provider errors,
  SQL details, secrets, hashes, or stack traces.
- When a controller contract changes, regenerate OpenAPI and the frontend
  client with `npm run api:client`.

## Authentication and authorization

- Phone login is passwordless: Redis-backed one-time OTP delivered by the SMS
  provider, then JWT access and rotating refresh tokens.
- OTP values and phone-derived Redis keys must remain HMAC-protected. Keep
  atomic issue, attempt counting, one-time verification, rollback, cooldown,
  and TTL behavior.
- Refresh tokens stay Argon2-hashed in PostgreSQL and rotate atomically.
- Never trust the role embedded in a JWT without checking the current active
  database user.
- `SUPER_ADMIN` inherits administrative endpoint access through `RolesGuard`.
  Service-level ownership and domain invariants still apply.
- Only `SUPER_ADMIN` can grant, modify, deactivate, or remove a
  `SUPER_ADMIN`. At least one active `SUPER_ADMIN` must remain.
- Add an audit record for security-sensitive staff, catalog, cash, and workflow
  changes.

## Order workflow invariants

- The canonical transition matrix lives only in
  `src/orders/order-policy.ts`.
- Enforce actor ownership:
  - a cook may act only on the order they accepted;
  - a courier may act only on orders assigned to them;
  - a customer may read/rate/cancel only their own order where allowed.
- Cancellation policy:
  - customer owner: `NEW` only;
  - `OPERATOR`, `ADMIN`, `SUPER_ADMIN`: `NEW`, `CONFIRMED`, and
    `SENT_TO_KITCHEN`;
  - nobody may cancel from `COOKING` or any later status.
- One courier may have multiple simultaneous active orders. Do not add a unique
  constraint or a one-active-order guard.
- Courier routes return all `ASSIGNED_TO_COURIER` and `OUT_FOR_DELIVERY`
  orders assigned to that courier.
- Use the order `version` field for optimistic concurrency on every status,
  cancellation, and assignment mutation.
- Record every successful state change in `OrderTransition`.
- Cash remains order-specific:
  `DELIVERED → CASH_RETURNED → COMPLETED → RECONCILED`.

## Data and transactions

- Prices, discounts, delivery fees, promo limits, and totals are calculated by
  the backend from current database data.
- Store immutable order snapshots for product names, unit prices, and delivery
  address fields.
- New or selected order addresses become active; the last used order address is
  the default for the next order.
- Multi-record writes use a Prisma transaction. Protect counters and state
  transitions with conditional updates, locks, or compare-and-swap semantics.
- Every Prisma schema change requires a checked-in migration. Never use
  destructive reset commands on a user database.

## Media and external services

- Accept only validated image content, enforce size limits, re-encode to WebP,
  use generated object names, and store objects in private S3-compatible
  storage.
- Local development uses MinIO; production uses S3/IAM-compatible credentials.
- Local SMS may use `console`; production must use either Twilio or the
  authenticated Android pull gateway.
- Android pull jobs must be encrypted at rest, atomically leased to one device,
  acknowledged with the matching receipt, and cancelled against the original
  OTP request when delivery fails.
- Production Redis must use TLS and must not persist plaintext OTP data.

## Tests

- Unit-test complete policy matrices, including deny-by-default cases.
- HTTP e2e-test every critical workflow across allowed and forbidden roles.
- Add concurrency tests for one-time tokens and versioned order mutations.
- Use only the isolated `alofood_test` database and Redis DB 15 in tests.
- A backend change is incomplete until lint, build, tests, coverage thresholds,
  and both development/production dependency audits pass.
