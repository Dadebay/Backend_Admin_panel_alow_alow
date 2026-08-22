# Catalog category grouping

This document is the maintenance and QA contract for category grouping in the
operations catalog and phone-assisted order flow.

## Scope

The same catalog response powers two different staff workflows:

- `/catalog` is an administrative view. It includes active and hidden products
  and categories so administrators can repair or re-enable them.
- `Заказ по звонку` is an order-entry view. It includes only products that can
  currently be ordered and never offers a product from a hidden category.

Visual grouping is a frontend projection of the existing cached catalog
response and does not add its own request or routing decision. Category records
now also own the default kitchen-printer IP, while a product may override that
default. The backend remains authoritative for availability, variants, prices,
effective receipt-printer routes, immutable order snapshots, and final totals.

The `/catalog` product groups are an accessible accordion. The first visible
group opens by default, every category header is a keyboard-operable button,
and administrators may expand or collapse all groups. Starting a text search
or selecting a category expands the resulting groups so matches are not hidden.
Only expanded groups mount their product tables.

## Data and ordering contract

Every product normally has a required category relation. The grouping helper is
defensive because the generated response type allows the expanded `category`
object to be absent:

1. Use `product.category.id` when the expanded category exists; otherwise use
   `product.categoryId`.
2. Sort groups by `category.sortOrder`, then by category name.
3. Preserve the API order of products inside each group.
4. Put a product without expanded category metadata in `Без категории`, after
   groups with a real sort order.
5. Never clone or rewrite a product, its variants, images, explicit/effective
   printer IP, price, or active state while grouping.

The shared pure functions live in
`apps/admin/src/entities/catalog/model/product-groups.ts`. Both widgets import
them from the public `entities/catalog` API; do not copy the filter or grouping
logic back into React components.

## Behavior matrix

| Scenario | `/catalog` | Phone-assisted order |
| --- | --- | --- |
| Active product in active category | Shown | Shown |
| Hidden product | Shown with hidden status | Excluded |
| Product in hidden category | Shown under hidden category | Excluded |
| Empty search | All records allowed by the workflow | All orderable records |
| Category selected | Only that category | Only that category |
| Product-name search | Match | Match |
| Category-name search | Match | Match |
| Slug, description, or printer-IP search | Match | Deliberately not matched |
| Search plus category filter | Both conditions apply | Both conditions apply |
| No matches | Explicit empty state | Explicit empty state |
| Product with variants | Grouped as one product; variants unchanged | Selector and per-variant quantity unchanged |

Search is trimmed and case-insensitive. It uses literal substring matching, not
a regular expression, so punctuation such as `[`, `*`, or `.` cannot break the
filter. A category button does not clear the current text query; both filters
remain visible and active until the user changes them.

## Stable UI selectors

Tests and QA automation may rely on these selectors:

- `catalog-product-groups`
- `catalog-product-group-{categoryId}`
- `catalog-product-group-toggle-{categoryId}`
- `catalog-product-group-panel-{categoryId}`
- `catalog-product-groups-collapse`
- `catalog-product-groups-expand`
- `assisted-product-search`
- `assisted-product-categories`
- `assisted-product-category-all`
- `assisted-product-category-{categoryId}`
- `assisted-product-groups`
- `assisted-product-group-{categoryId}`
- `assisted-product-variant-{productId}`
- `assisted-product-minus-{productId}`
- `assisted-product-plus-{productId}`

Backend IDs, not array indexes or localized labels, are the stable suffixes.

## Automated test coverage

`apps/admin/tests/catalog-product-groups.test.mjs` covers:

- normal category ordering and stable product order;
- empty arrays and whitespace-only queries;
- equal sort orders and deterministic name ordering;
- missing expanded category metadata;
- hidden product/category differences between the two workflows;
- every catalog search field and the intentionally narrower order search;
- composition of category and text filters;
- literal punctuation queries;
- preservation of object identity and variants;
- a large-menu case with 1,000 products across 50 categories;
- stable component selectors and responsive CSS hooks.

Run the focused test with:

```bash
node --test --test-force-exit tests/catalog-product-groups.test.mjs
```

Run the release checks with:

```bash
npm run lint
npm test
npm audit --audit-level=low
```

Commands are executed from `apps/admin`.

## Manual QA checklist

Use a menu containing active and hidden categories, base products, variant
products, missing images, long names, and at least 50 products.

### Catalog

1. Open `/catalog` and confirm group order matches category order.
2. Confirm the first group starts open; toggle several category headers with
   mouse and keyboard, then verify `Свернуть все` and `Раскрыть все`.
3. Filter one category and confirm exactly one expanded group remains.
4. Search by product, category, slug, description, and printer IP; matching
   groups must open automatically.
5. Set the main printer, a category printer and a different product printer;
   verify the table labels the product route as inherited or overridden.
6. Combine search with a category and verify both filters apply.
7. Confirm hidden records remain editable and a no-match query shows the empty
   state.

### Phone-assisted order

1. Open `Заказ по звонку` and confirm only orderable products appear.
2. Select category chips, including `Все`, and verify counts and pressed state.
3. Search by product and category with mixed case and surrounding spaces.
4. Combine chip and search filters, then add a base product.
5. Select two different variants of one product and verify their quantities and
   subtotal remain independent.
6. Verify hidden products/categories never appear.
7. Check keyboard focus, horizontal category-chip scrolling, sticky group
   headings, empty state, and no page-level horizontal overflow on desktop and
   390 px mobile.

## Performance and maintenance limits

Filtering and grouping are linear in the number of returned products, followed
by sorting only the category groups. They are memoized by the owning widgets
and reuse the TanStack Query response. If the global catalog grows enough to
make a 1,000-item local projection measurable in production, move catalog
pagination/filtering to the backend before adding another client cache or state
owner.

When changing this behavior:

1. Update the pure helpers and their good, empty, hidden, malformed, combined,
   and large-menu cases together.
2. Preserve the stable selectors or provide an explicit automation migration.
3. Keep catalog administration and order eligibility as separate policies.
4. Record new behavior and measured bundle impact in `PROJECT_CONTEXT.md`.
5. Verify production assets and health after deployment; rollback uses the
   previous immutable admin image and must not alter catalog data.
