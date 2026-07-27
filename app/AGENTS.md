# React admin instructions

These rules apply to the Next.js admin under `app/` and define the target
frontend architecture for the accompanying `src/` layers.

## Current-state warning

The current `app/page.tsx` is a visual prototype with local demo arrays and
`useState`. It is not proof that the backend integration is complete. Do not
add more server-backed behavior to this monolith. Extract the touched domain
into the architecture below and connect it to the real API.

## Target FSD structure

Keep Next.js routing and provider composition in `app/`. Put product code in:

```text
src/
├── widgets/       # composed admin sections: order board, map, navigation
├── features/      # user actions: transition, cancel, assign, edit, upload
├── entities/      # order, courier, product, promo, staff domain UI/model
└── shared/        # generated API, HTTP client, query client, UI primitives
```

Allowed dependency direction:

```text
app → widgets → features → entities → shared
```

A lower layer must never import from a higher layer. Cross-slice imports must
use the slice public API rather than another slice's internal files. Keep route
files thin: route composition, metadata, and provider wiring only.

## Server state and API

- Use TanStack Query for all backend state: orders, couriers, catalog, banners,
  promos, staff, addresses, authentication mutations, and media metadata.
- Use a single `QueryClient` provider and centralized query-key factories.
- Keep query functions and mutations next to the owning entity/feature.
- After a mutation, update or invalidate the smallest relevant query set.
- Use optimistic updates only when rollback is deterministic; otherwise wait
  for the server response and show pending state.
- The live order board may poll with a documented interval until a real-time
  transport is introduced. Do not create multiple competing polling loops.
- Never copy server data into component state just to filter or render it.
- Use the Swagger-generated TypeScript contract. Do not hand-write duplicate
  API response types or silently cast responses to `any`.
- Keep one HTTP client responsible for base URL, bearer token attachment,
  refresh serialization, normalized errors, and request cancellation.

## Tables

- Use TanStack Table for orders, staff, products, promos, and cash settlement
  lists.
- Prefer server-side pagination, filtering, and sorting for growing datasets.
- Keep column definitions in the owning entity/widget, not inside a route.
- Derive visible actions from the authenticated role for usability, but always
  treat backend authorization as final.
- Preserve accessible table headers, keyboard actions, loading/empty/error
  states, and a responsive small-screen representation.

## State ownership

- TanStack Query: remote/server state.
- Component state: transient UI such as an open modal, selected row, or input.
- URL search params: shareable filters, pagination, and selected status.
- Introduce Zustand only for genuinely cross-route client state that cannot be
  derived from the URL, auth session, or query cache.
- Never keep access control, prices, totals, or workflow truth in a client
  store.

## UI and forms

- Break large screens into widgets and feature actions before adding behavior.
- Use controlled, typed forms with schema validation for catalog, promo, staff,
  and address mutations.
- Every async screen needs loading, empty, error, retry, pending, and success
  feedback.
- Disable duplicate mutation submissions and surface `409 Conflict` as a
  reload/retry instruction.
- Keep role and status labels centralized and exhaustive so new enum values
  fail TypeScript checks.
- Do not expose development OTP codes, tokens, or provider details in
  production UI.

## Frontend completion checklist

- The screen reads and writes through the real API.
- Query caching/invalidation behavior is tested.
- TanStack Table state maps correctly to API pagination/filter parameters.
- Role-sensitive actions are hidden or disabled appropriately, and forbidden
  backend responses are handled.
- OpenAPI types are current.
- Lint, production build, UI tests, and dependency audit pass.
