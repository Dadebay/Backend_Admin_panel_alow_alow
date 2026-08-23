# Courier map and receipt routing regression contract

This document is the maintenance and QA contract for the all-courier dispatch
map, whole-shift GPS sharing, category visibility, and receipt-printer routing.
The durable business decisions remain in `docs/PROJECT_CONTEXT.md`; this file
records how those decisions are verified.

## Required behavior

### Courier map

- The default dispatch view fits every courier that has a current Redis GPS
  point. Selecting one courier may add their route and delivery stops, but must
  not remove the other courier markers.
- Every located courier marker permanently displays the courier name and one
  workload label: `Свободен`, `В заказе #<number>`, or
  `В заказах · <count>`.
- Workload and GPS presence are independent. A courier with active orders is
  busy even when the point is `STALE`; `ONLINE`, `STALE`, and `OFFLINE` must
  never be used as substitutes for free/busy state.
- The overview counts busy couriers across all active couriers, free couriers
  only while online, located couriers with a point, online couriers, and the
  total courier count independently.
- Moving an order to `DELIVERED` removes it from `activeOrders`, changes the
  workload label to `Свободен`, and preserves the courier point. The courier
  may continue publishing new points after delivery.
- Mobile publishes approximately every 10–15 seconds for the whole shift,
  including between orders. Only explicit end-of-shift deletion stops sharing.
  A point without new updates becomes `STALE` after five minutes and expires
  from Redis after fifteen minutes.

### Category visibility and receipt routing

- `ADMIN` and `SUPER_ADMIN` may hide or show a complete category. Other roles
  are denied by the API.
- Hiding a category removes the category and all of its products from the
  public catalog without changing individual product records, sort order, or
  the configured category printer address. The authenticated admin catalog
  continues to return the hidden category.
- Only private LAN IPv4 addresses are accepted for main, category, and product
  printer routes. An empty quick-settings field stores `null`; the catalog UI
  also provides explicit clear actions for every routing level.
- Effective kitchen routing is exclusive:
  `product.receiptPrinterIp ?? category.receiptPrinterIp`. A product override
  creates one job on the product printer and no duplicate job on the category
  printer.
- Each order item snapshots its effective route. Later catalog changes do not
  reroute an existing order. The complete main-printer job always contains all
  order lines; missing kitchen routes remain visible as unassigned items.
- `ADMIN` and `SUPER_ADMIN` may permanently delete an unused product or an
  unused category and all of its products after confirmation. The API audits
  the deletion and retains media objects. Any order-history reference protects
  the product and its category with `409 Conflict`; staff must hide the record
  instead.

## Automated coverage

| Area | Test | Contract covered |
| --- | --- | --- |
| Courier labels and overview | `apps/admin/tests/courier-map.test.mjs` | Empty/mixed courier sets, one/multiple orders, stale busy courier, online/free and GPS counts, permanent markers, whole-shift interval |
| Category quick settings | `apps/admin/tests/category-receipt-routes.test.mjs` | Printer update preserves visibility/order, blank IP becomes `null`, visibility toggle preserves printer route |
| LAN validation and UI wiring | `apps/admin/tests/form-schemas.test.mjs`, `apps/admin/tests/receipt-printing.test.mjs` | Private IPv4 validation, stable selectors, quick-settings integration and printer hierarchy copy |
| Catalog deletion UI | `apps/admin/tests/catalog-deletion.test.mjs` | Authenticated DELETE mutations, cache refresh, accessible confirmation, pending and failure states |
| API authorization and public visibility | `apps/api/test/security.e2e.spec.ts` | Forbidden roles, audited category hiding/deletion, deletion conflicts for order history, public product removal, admin visibility, GPS persistence and a new point after `DELIVERED`, explicit stop sharing |
| Immutable print plan | `apps/api/test/receipt-print-plan.spec.ts` | Main copy, grouping by snapshotted IP, exclusive product/category result and unassigned items |

Required release checks are the root `AGENTS.md` backend and frontend command
sets. API contract changes also require `npm run api:client` before frontend
verification.

## Manual QA matrix

1. Open `/couriers/map` with at least one free online courier, one busy online
   courier, one busy stale courier, and one courier without GPS. Verify marker
   labels, colors, dashed stale state, overview counts, and no horizontal
   overflow on desktop and phone.
2. Select a busy courier. Verify their backend road route and stops appear
   while every other located courier marker remains visible. Return with
   `Все курьеры`.
3. Complete the courier's last order. Verify the same marker remains, changes
   to `Свободен`, and moves when the mobile client publishes the next point.
   End the shift explicitly and verify the point disappears.
4. In `/catalog`, set a category printer, hide the category, reload, and show
   it again. Verify the printer address and sort order are preserved and the
   customer catalog hides/shows all products with the category.
5. Clear the main and category printer with their visible actions. Give one
   product its own IP, then use `Убрать свой IP`; verify it immediately resumes
   category inheritance.
6. Delete an unused dish and an unused category after confirmation. Then try to
   delete a dish and category used by an order; verify the dialog shows the
   conflict and both records remain available to hide.
7. Create one product without an override and one with another private IP.
   Print a mixed order. Verify one complete main receipt, one inherited kitchen
   receipt, and one override kitchen receipt with no duplicate product line.
8. Repeat the affected screens in Chrome, Firefox, and Safari at desktop and
   phone widths. Check keyboard focus, disabled/pending states, console errors,
   marker-label overlap, and long courier/category names.

## External mobile boundary

Android applications are maintained in separate repositories. Their release
is incomplete until the courier client keeps publishing GPS after delivery and
stops only through the explicit end-shift action. The API and admin behavior in
this repository cannot keep a courier visible indefinitely if the mobile app
stops sending points or the operating system suspends background location.
