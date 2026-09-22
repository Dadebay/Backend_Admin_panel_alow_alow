import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deliveryFeeForSubtotal,
  findDeliveryEtrapForAddress,
  flattenDeliveryEtraps,
} from "../src/entities/delivery/model/types.ts";
import {
  deliveryEtrapFormSchema,
  deliveryWelayatFormSchema,
} from "../src/widgets/delivery-manager/model/delivery-form.ts";

const config = {
  fallbackPrice: 15,
  fallbackFreeDeliveryThreshold: 150,
  welayats: [
    {
      id: 1,
      nameEn: "Ashgabat",
      nameRu: "Ашхабад",
      nameTk: "Aşgabat",
      sortOrder: 1,
      etraps: [
        {
          id: 25,
          welayatId: 1,
          nameEn: "1 Microdistrict",
          nameRu: "1 мкр",
          nameTk: "1-nji etrapça",
          queuePosition: 0,
          price: 20,
          freeDeliveryThreshold: 200,
          isDeliveryEnabled: true,
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
        {
          id: 313,
          welayatId: 1,
          nameEn: null,
          nameRu: "ул. Кемине (район бывшей стеколки)",
          nameTk: "Kemine köç. (öňki Aýna kombinat)",
          queuePosition: null,
          price: 15,
          freeDeliveryThreshold: 150,
          isDeliveryEnabled: true,
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
    },
  ],
};

test("delivery estimate follows the selected backend config projection", () => {
  const [etrap] = flattenDeliveryEtraps(config);
  assert.equal(etrap.welayatNameRu, "Ашхабад");
  assert.equal(deliveryFeeForSubtotal(199.99, etrap), 20);
  assert.equal(deliveryFeeForSubtotal(200, etrap), 0);
  assert.equal(
    deliveryFeeForSubtotal(1_000, {
      price: 25,
      freeDeliveryThreshold: null,
    }),
    25,
  );
});

test("address text suggests one unambiguous configured tariff zone", () => {
  const match = findDeliveryEtrapForAddress(config, [
    "Kemine (2035) köçesi, Berkararlyk etraby, Aşgabat şäheri, 425648, Türkmenistan",
  ]);

  assert.equal(match?.id, 313);
  assert.equal(match?.price, 15);
  assert.equal(
    findDeliveryEtrapForAddress(config, ["Неизвестный адрес"]),
    null,
  );
});

test("ambiguous address text preserves the backend fallback tariff", () => {
  const ambiguousConfig = structuredClone(config);
  ambiguousConfig.welayats[0].etraps.push({
    ...ambiguousConfig.welayats[0].etraps[1],
    id: 314,
    nameRu: "Кемине",
    nameTk: "Kemine",
  });

  assert.equal(
    findDeliveryEtrapForAddress(ambiguousConfig, ["Kemine köçesi"]),
    null,
  );
});

test("delivery directory forms validate and normalize every admin-managed field", () => {
  assert.deepEqual(
    deliveryWelayatFormSchema.parse({
      nameEn: " Test region ",
      nameRu: " Новый велаят ",
      nameTk: " Täze welaýat ",
      sortOrder: "8",
    }),
    {
      nameEn: "Test region",
      nameRu: "Новый велаят",
      nameTk: "Täze welaýat",
      sortOrder: 8,
    },
  );
  assert.equal(
    deliveryWelayatFormSchema.safeParse({
      nameEn: "",
      nameRu: "",
      nameTk: "Täze welaýat",
      sortOrder: "1",
    }).success,
    false,
  );
  assert.deepEqual(
    deliveryEtrapFormSchema.parse({
      welayatId: "2",
      nameEn: "",
      nameRu: "Новый район",
      nameTk: "Täze etrap",
      queuePosition: "",
      price: "24,50",
      freeDeliveryThreshold: "",
      isDeliveryEnabled: true,
    }),
    {
      welayatId: 2,
      nameEn: null,
      nameRu: "Новый район",
      nameTk: "Täze etrap",
      queuePosition: null,
      price: 24.5,
      freeDeliveryThreshold: null,
      isDeliveryEnabled: true,
    },
  );
});

test("delivery manager reads and writes the real API with stable selectors", async () => {
  const [queries, actions, manager, zoneMap] = await Promise.all([
    readFile(
      new URL(
        "../src/entities/delivery/api/delivery-queries.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/delivery-management/api/use-delivery-actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/delivery-manager/ui/delivery-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/delivery-manager/ui/delivery-zone-map.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(queries, /"\/delivery\/config"/);
  assert.match(queries, /"\/delivery\/admin\/config"/);
  assert.match(actions, /\/delivery\/admin\/settings/);
  assert.match(actions, /\/delivery\/admin\/welayats/);
  assert.match(actions, /\/delivery\/admin\/welayats\/\$\{id\}/);
  assert.match(actions, /\/delivery\/admin\/etraps"/);
  assert.match(actions, /\/delivery\/admin\/etraps\/\$\{id\}/);
  assert.match(manager, /data-testid="delivery-settings-form"/);
  assert.match(manager, /data-testid="delivery-welayat-form"/);
  assert.match(manager, /data-testid="delivery-welayat-create"/);
  assert.match(manager, /data-testid="delivery-etrap-form"/);
  assert.match(manager, /data-testid="delivery-etrap-create"/);
  assert.match(manager, /data-testid="delivery-etrap-welayat"/);
  assert.match(manager, /data-testid="delivery-etrap-name-ru"/);
  assert.match(manager, /data-testid="delivery-etrap-search"/);
  assert.match(manager, /data-testid="delivery-zone-overview"/);
  assert.match(manager, /data-testid="delivery-zone-editor"/);
  assert.match(manager, /data-testid="delivery-map-pricing-enabled"/);
  assert.match(manager, /deliveryZone: zoneDraft\.length >= 3/);
  assert.match(zoneMap, /data-testid="delivery-zone-map"/);
  assert.match(zoneMap, /data-testid="delivery-zone-map-undo"/);
  assert.match(zoneMap, /data-testid="delivery-zone-map-clear"/);
  assert.match(zoneMap, /<Polygon/);
  assert.match(manager, /getRowId=\{\(etrap\) => String\(etrap\.id\)\}/);
});
