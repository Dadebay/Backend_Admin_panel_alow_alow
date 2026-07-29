# AlowAlow repository instructions

These instructions are mandatory for every task in this repository. More
specific `AGENTS.md` files extend them for their directory.

## Start every task by restoring context

1. Read `docs/PROJECT_CONTEXT.md`.
2. Read the nearest nested `AGENTS.md` for every area being changed:
   - `apps/api/AGENTS.md` for NestJS, Prisma, Redis, S3, auth, or backend tests.
   - `apps/admin/AGENTS.md` for React, Next.js, admin UI, or frontend architecture.
3. Inspect `git status` and preserve unrelated user changes.
4. Confirm the current schema and policies in code instead of relying only on
   chat history.

If a new requirement changes a role, permission, order status, cancellation
rule, payment flow, external provider, or architecture decision, update
`docs/PROJECT_CONTEXT.md` in the same change. This is the durable source for
future sessions and context compaction.

If a task adds, removes, renames, or moves a major backend module or frontend
FSD slice, update the repository tree in `docs/PROJECT_CONTEXT.md` as part of
the same change.

## Sources of truth

Use these in order:

1. The user's latest explicit requirement.
2. `docs/PROJECT_CONTEXT.md` for accepted business behavior.
3. `apps/api/prisma/schema.prisma` for persisted data and enums.
4. `apps/api/src/orders/order-policy.ts` for order transition and cancellation
   authorization.
5. NestJS controllers and DTOs for the public API contract.
6. `apps/api/openapi.json` and `packages/api-contract/src/schema.ts`.

The React UI is never the authority for permissions, totals, discounts, order
transitions, or cancellation. The backend must enforce every rule.

## Repository boundaries

- `apps/api/`: NestJS API, Prisma/PostgreSQL, Redis OTP, SMS, and S3 media.
- `apps/admin/app/`: Next.js route composition for the React admin.
- `apps/admin/src/`: frontend FSD product layers.
- `packages/api-contract/`: generated TypeScript contract shared from Swagger.
- Root, API, and admin keep independent npm lockfiles. This prevents one
  application's security overrides from silently changing another tree.
- `docker-compose.yml`: local PostgreSQL, Redis, and MinIO only.
- `apps/admin/.openai/hosting.json`: existing private Sites project for the admin.

Do not introduce a second API client, a second role enum, or duplicate order
state machines in unrelated files.

## Cross-project engineering rules

- Pin dependency versions exactly and preserve npm plus each package boundary's
  lockfile.
- Never edit generated Prisma client files by hand.
- Never edit `apps/api/openapi.json` or `packages/api-contract/src/schema.ts`
  by hand; regenerate
  them with `npm run api:client`.
- Do not commit secrets, real OTP codes, production tokens, S3 credentials, or
  Twilio credentials.
- Prefer small domain modules over large shared utility files.
- Keep business terminology consistent with the backend enum names.
- Any production-impacting mutation must have authorization, validation,
  conflict handling, audit/history where applicable, and a test.
- Preserve backward compatibility unless the user explicitly approves a
  breaking API or migration.

## Required verification

For backend changes:

```bash
npm --prefix apps/api run lint
npm --prefix apps/api run build
npm --prefix apps/api test
npm --prefix apps/api audit --audit-level=low
```

For frontend changes:

```bash
npm --prefix apps/admin run lint
npm --prefix apps/admin test
npm --prefix apps/admin audit --audit-level=low
```

For API contract changes, run `npm run api:client` before frontend checks.
For Prisma changes, add a migration, generate Prisma Client, and verify the
migration against local PostgreSQL plus the isolated test database.

## Definition of done

- The requested behavior works through the real API, not only demo UI state.
- Authorization is deny-by-default and tested for allowed and forbidden roles.
- Swagger and generated TypeScript types match the backend.
- Business context documentation matches the implementation.
- Frontend runtime changes satisfy the performance contract in
  `apps/admin/AGENTS.md`, with measurement for order-board, table, map,
  provider, or
  data-cache changes.
- The worktree contains no accidental files or unrelated edits.
- Local development processes and Docker services are stopped at handoff unless
  the user asks to keep them running.
- If frontend runtime code changed, validate and privately publish the existing
  Sites project unless the user explicitly requests local-only work.
