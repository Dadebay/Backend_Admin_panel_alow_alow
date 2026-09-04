# Durable receipt queue — 2026-09-04

Implemented and verified locally in API, admin and Go agent.
Production push/deployment authorized by the user on 2026-09-04; rollout pending.
The Windows investigation is preserved in [the handoff](RECEIPT_PRINTING_WINDOWS_HANDOFF.md).

## Delivery contract

- `OrdersService.createForCustomer` inserts `ORDER_CREATED:<orderId>` with the
  order transaction for both customer/API and staff phone orders. Cancellation
  inserts `ORDER_CANCELLED:<orderId>` in its transaction. An outbox failure rolls
  back the transaction; a disconnected workstation never prevents its commit.
- Migration `20260904010000_durable_receipt_queue` adds tasks, a permanent queue
  lock row and optional order-creation idempotency records. There is no old-order
  backfill. Web/mobile clients can reuse `idempotencyKey` for creation retries;
  the phone-order hook does so until success or a changed request body.
- Each task stores a frozen backend receipt plan and unique `dispatchId`.
  Main-printer selection is resolved at enqueue time; kitchen routes remain
  order-line snapshots. Retrying never regenerates the payload. An explicit
  new reprint obtains current main settings and a new dispatch identity.
- An operations consumer requires local health capabilities `receipt-layout-v2`
  and `dispatch-journal-v1`. PostgreSQL serializes claim selection with a row
  lock; there is at most one active lease. The lease lasts 180 seconds with
  30-second heartbeats. Claims carry a random token, authenticated actor and
  persistent Go `agentId`; stale/foreign tokens cannot change the outcome.
- Once claimed, the task stays bound to that installation. Lease recovery never
  sends an old potentially completed task to another workstation. Replacing an
  EXE under the same OS account preserves identity; deleting its journal or
  switching OS accounts does not. Queue UI identifies tasks waiting for their
  original workstation.
- Browser/server/agent outages preserve tasks. Definitively unsent copies retry
  indefinitely with exponential delay capped at 60 seconds. The five-second
  visible-tab poll resumes pending work on first load, including work created
  while the browser was closed. Site and local agent must both be open to send.
- Go serializes entire dispatches, fsyncs a `started` record before each copy,
  then a `sent` or definitely-unsent `retryable` result. A completed copy is
  returned from its journal without printer I/O. A request with the same ID but
  different content fails with conflict. A supplied mismatched agent ID fails
  before printer I/O. A RAW TCP endpoint has a 1.5-second cooldown across copies
  and orders, retaining main/kitchen as intentionally separate copies.
- A partial write, unknown HTTP result, unfinished `started` record, torn record
  or journal storage failure produces `UNCERTAIN`. Automatic retries stop;
  staff inspect the paper before deliberately creating a new copy. Never infer
  physical paper from a successful TCP write: API `DELIVERED` means the agent
  reported all transport sends complete, and audit metadata says
  `paperConfirmed: false`.
- Journals contain only fingerprints and per-copy results, not receipt/customer
  content or credentials. They are not automatically evicted. A process file
  lock permits one writer. Support-log rotation/export never removes journals.
  Disk-full or corrupt storage fails closed instead of bypassing deduplication.
- Manual reprint is explicit and has a separate HTTP idempotency key. It can
  intentionally reproduce previously printed copies; the UI asks for paper
  confirmation. A failed manual-request response retains its key for retry.
  Missing printer routes require configuration and a fresh print plan.

## API

All paths are under `/api/v1`, require an active staff session, and allow only
`OPERATOR`, `ADMIN` or `SUPER_ADMIN`:

| Method / path | Purpose |
| --- | --- |
| GET `/receipt-print-tasks` | First 50 outstanding tasks, pending and attention counts; no receipt/customer payload |
| POST `/receipt-print-tasks/claim` | Atomically claim one eligible task for `stationId` |
| POST `/receipt-print-tasks/:id/heartbeat` | Renew matching actor/station/claim token |
| POST `/receipt-print-tasks/:id/outcome` | Record `DELIVERED`, `RETRY`, `UNCERTAIN` or `FAILED` |
| POST `/receipt-print-tasks/:id/retry` | Move a safe pending/failed task's retry time to now; cannot reset uncertainty |
| POST `/receipt-print-tasks/orders/:orderId/reprint` | Audited, intentional new dispatch, deduplicated by request key |

The preexisting receipt-plan endpoint remains available for compatibility.
`NewOrderAlert` is now notification-only; no client seen-ID list or cancellation
success callback is a delivery trigger. Swagger and shared types are generated
with `npm run api:client`.

## Verification

- The new migration applies successfully to the local database and the isolated
  test database; the new queue tables match Prisma. A full local schema diff
  still reports preexisting defaults on `ContactSettings.updatedAt`,
  `ReceiptPrintSettings.updatedAt`, and `LoginAttempt.id`, plus the existing
  `LoginAttempt.userId` foreign-key action difference. These unrelated columns
  were not altered by this migration.
- API: 118 tests including real HTTP/PostgreSQL rollback, both creation paths,
  concurrent create/claim/reprint, nested-payload conflicts, lease expiration,
  foreign/stale acknowledgments, long outages, cancellation and forbidden roles.
  Coverage: 89.85% statements, 74.52% branches, 91.18% functions, 91.07% lines.
- Admin: 135 tests, production build and lint. Behavioral worker tests cover lost
  replies, matching result validation, lost backend ACK, uncertainty and offline
  handling. Existing route/order/permission tests remain enabled.
- Go: race tests, vet and five cross-builds (Windows x64/x86/ARM64; Mac
  Apple Silicon/Intel). Tests include real HTTP response loss, journal restart,
  concurrent dispatches, partial-copy retry, ambiguous writes, torn/inaccessible
  journal, identity mismatch, process locking and cooldown across orders.
- Existing dependency audit findings were resolved by exact API transitive pins
  `fast-uri 4.1.4`, `mysql2 3.24.3`, `qs 6.16.0`. API development/production and
  admin audits report zero vulnerabilities. The admin dependency tree is unchanged.
- The ignored `outputs/receipt-queue-20260904/` directory contains the local QA
  script/report/screenshots and release packages. It runs the production admin,
  actual NestJS API against isolated `alofood_test`, actual Go binary and a TCP
  sink bound to this Mac. It never sends to physical receipt printers.
- Seven measured delivery scenarios: phone order before first page load; two
  competing tabs; disconnected/reconnected printer; lost agent reply plus page
  reload; lost backend ACK plus Go restart and lease recovery; intentional
  reprint and cancellation; ambiguous J-Speed HTTP error stopping auto retry.
  The sink received exactly fourteen expected main/kitchen copies, with no
  extra connections on replay. This is software verification, not a Windows
  hardware receipt test.
- Chromium, Firefox and WebKit were exercised at 1366 px and 390 px against the
  running API, with the order board fully loaded, no horizontal overflow and
  no runtime page errors. Queue disclosure also works by keyboard. Branded
  Windows Chrome/Edge, desktop Safari and physical mobile devices were not
  separately run. A 162-file TypeScript import graph check found no cycles;
  frontend hygiene passed against the repository's actual `origin/main` base.
- During 11 idle seconds, one visible tab made two backlog polls and two local
  health polls, zero claims and zero DOM mutations in the order board. The queue
  does not invalidate order queries. The production entry is 242.14 KB / 77.68 KB
  gzip; order board 58.44 KB / 16.34 KB gzip; queue CSS 0.70 KB / 0.35 KB gzip.
  No runtime dependency was added. These local measurements do not establish
  production p75 Core Web Vitals or exact React render counts.

## Coordinated rollout and rollback

The user explicitly authorized push and production deployment on 2026-09-04.
Use the repository's `main` → GitHub Actions → VDS deployment flow and its
documented domestic fallback when hosted-runner SSH is unreachable.
No manual database edits or Sites release.

1. Close old frontend tabs on every printing workstation and stop old agents.
   Mixed old/new frontend versions can still originate separate print requests;
   a UUID journal cannot recognize two independently allocated identities as
   the same intended receipt.
2. Install the new EXE/binary using the same OS account. Preserve the journal:
   Windows `%APPDATA%\A7-tagam\PrintAgent\dispatches`; Mac
   `~/Library/Application Support/A7-tagam/PrintAgent/dispatches`.
3. Deploy migration/API/admin as one coordinated release. The migration does not
   print historical orders; newly committed orders become pending tasks.
4. Reopen the updated site on the printing workstation, check queue health and
   perform one controlled order with its expected main/kitchen copies. Check a
   disconnect/reconnect and verify no additional replayed copy appears.
5. Keep the site and agent running for queue consumption. If the original
   workstation is unavailable, preserve its outstanding tasks and inspect
   receipts before intentionally reprinting elsewhere; do not clear binding or
   journal to force a retry.

If a release is rolled back, close the queue consumers first and preserve both
PostgreSQL tasks and local journals. Do not re-enable old auto-print observers
against outstanding new-queue orders: they can allocate independent identities.
Prefer leaving intake available with printing paused, then resume the new
consumer after the fix. No destructive down migration is needed.

## Dev Notes

http://127.0.0.1:4310/orders (local QA URL; processes stopped at handoff)

Проверить:
- Заказ через API и по телефону появляется в очереди, даже если сайт был закрыт.
- Две вкладки получают одно задание; главный и кухонный чек остаются отдельными.
- Отключение сети сохраняет очередь; возврат связи продолжает неотправленные копии.
- Потеря ответа и перезапуск программы не повторяют выполненные копии.
- Неизвестный результат требует проверки бумаги; новая копия создаётся явно.
- Отмена создаёт отдельный чек, а запрет ролей проверяет сервер.
- Desktop/mobile очередь, раскрытие, ожидание, ошибки и ручные действия.
- На реальном Windows 10 со свитчем — проверить новую сборку после согласованного
  обновления сайта. Физическая Windows-печать новой сборкой локально не проверялась.
