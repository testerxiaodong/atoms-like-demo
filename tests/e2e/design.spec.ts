import { test, expect } from "@playwright/test";

test("product surfaces fit narrow and desktop screens", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/login", "/signup", "/demo?example=tasks"]) {
      await page.goto(path);
      await expect(page.locator("main, .workspace").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("workspace view and device controls expose selection and keyboard tooltips", async ({
  page,
}) => {
  await page.goto("/demo?example=tasks");
  const code = page.getByRole("button", { name: "代码", exact: true });
  const preview = page.getByRole("button", { name: "预览", exact: true });
  await expect(preview).toHaveAttribute("aria-pressed", "true");
  await code.focus();
  await page.keyboard.press("Enter");
  await expect(code).toHaveAttribute("aria-pressed", "true");
  await expect(preview).toHaveAttribute("aria-pressed", "false");
  await preview.focus();
  await page.keyboard.press("Enter");
  const mobile = page.getByRole("button", { name: "手机预览", exact: true });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(mobile).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("390px");
  await expect(mobile).toHaveAccessibleDescription("手机宽度 · 390px");
  await page.keyboard.press("Enter");
  await expect(mobile).toHaveAttribute("aria-pressed", "true");
  const frame = page.locator('iframe[title="应用实时预览"]');
  await expect(frame).toBeVisible();
  expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(390);
});

test("homepage illustration opens a usable anonymous example", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "体验这个示例" }).click();
  await expect(page).toHaveURL(/\/demo\?example=tasks$/);
  await expect(
    page.frameLocator('iframe[title="应用实时预览"]').locator("body"),
  ).toContainText("小事");
  await expect(
    page.getByRole("textbox", { name: "给构建助手发消息" }),
  ).toBeDisabled();
});
