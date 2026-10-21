import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { create, root } from "../support/http";

test("delete project menu and dialog support cancel, error retry and persistent removal", async ({
  page,
  context,
}) => {
  const p = await create(context.request, `Delete UI ${crypto.randomUUID()}`);
  await page.goto("/projects");
  const menu = page.getByRole("button", {
    name: `项目操作 ${p.name}`,
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "删除这个项目？" });
  const open = async () => {
    await menu.click();
    await page.getByRole("menuitem", { name: "删除项目", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "取消", exact: true }),
    ).toBeFocused();
    await expect(dialog).toContainText(p.name);
  };
  await open();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
  expect((await context.request.get(`${root}/${p.id}`)).status()).toBe(200);
  await open();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.route(`**/api/projects/${p.id}`, async (route) => {
    if (route.request().method() === "DELETE")
      await route.fulfill({
        status: 503,
        json: { error: "删除连接失败，请重试" },
      });
    else await route.continue();
  });
  await open();
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("删除连接失败，请重试");
  await expect(
    dialog.getByRole("button", { name: "确认删除", exact: true }),
  ).toBeEnabled();
  await page.unroute(`**/api/projects/${p.id}`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/projects/${p.id}`, async (route) => {
    if (route.request().method() === "DELETE") await gate;
    await route.continue();
  });
  try {
    await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "正在删除…" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "取消", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  } finally {
    release();
  }
  await expect(menu).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(menu).toHaveCount(0);
  expect((await context.request.get(`${root}/${p.id}`)).status()).toBe(404);
});
