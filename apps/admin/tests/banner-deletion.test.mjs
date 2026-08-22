import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsUrl = new URL(
  "../src/features/marketing-management/api/use-marketing-actions.ts",
  import.meta.url,
);
const managerUrl = new URL(
  "../src/widgets/marketing-manager/ui/marketing-manager.tsx",
  import.meta.url,
);

test("banner deletion uses the authenticated API and refreshes marketing data", async () => {
  const actions = await readFile(actionsUrl, "utf8");

  assert.match(actions, /const deleteBanner = useMutation/);
  assert.match(actions, /`\/marketing\/banners\/\$\{id\}`/);
  assert.match(actions, /method: "DELETE"/);
  assert.match(actions, /queryKey: \[\.\.\.marketingQueryKeys\.all, "banners"\]/);
  assert.match(actions, /onSuccess: refreshBanners/);
  assert.match(actions, /deleteBanner,/);
});

test("banner deletion requires an explicit accessible confirmation", async () => {
  const manager = await readFile(managerUrl, "utf8");

  assert.match(manager, /\[bannerDelete, setBannerDelete\]/);
  assert.match(manager, /data-testid=\{`banner-delete-open-\$\{row\.original\.id\}`\}/);
  assert.match(manager, /data-testid="banner-delete-dialog"/);
  assert.match(manager, /role="alertdialog"/);
  assert.match(manager, /aria-modal="true"/);
  assert.match(manager, /data-testid="banner-delete-cancel"/);
  assert.match(manager, /data-testid="banner-delete-confirm"/);
  assert.match(manager, /deleteBanner\.isPending/);
  assert.match(manager, /await marketing\.deleteBanner\.mutateAsync/);
  assert.match(manager, /Файл изображения останется в приватном/);
  assert.match(manager, /Удалить навсегда/);
});
