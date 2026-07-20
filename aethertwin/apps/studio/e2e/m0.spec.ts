import { expect, test } from "@playwright/test";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!localHosts.has(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.routeWebSocket(
    (url) => !localHosts.has(url.hostname),
    (ws) => ws.close({ code: 1008, reason: "blockedbyclient" }),
  );
});

for (const [button, profile] of [
  ["新建店铺展厅", "showroom"],
  ["新建市集导览", "market"],
] as const) {
  test(`creates ${profile} offline`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: button }).click();
    await page.getByLabel("项目名称").fill(`${profile} demo`);
    await page.getByRole("button", { name: "创建项目" }).click();
    await expect(page.getByText("项目概览")).toBeVisible();
    await expect(page.getByText(profile)).toBeVisible();
  });
}
