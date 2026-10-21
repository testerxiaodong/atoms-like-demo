import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { create, detail } from "../support/http";

test("received candidate file paths are visible before completion and remain visible after reload", async ({
  page,
  context,
}) => {
  const p = await create(context.request, "File progress");
  await page.goto(`/projects/${p.id}`);
  await page
    .getByRole("textbox", { name: "给构建助手发消息" })
    .fill("E2E_FILE_PROGRESS");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const activity = page.locator(".agent-progress .agent-file-list");
  await expect(activity).toContainText("/components/Counter.tsx");
  await expect(activity).toContainText("新增");
  await expect(activity).toContainText("候选文件");
  await expect(
    page.getByRole("button", { name: "停止任务", exact: true }),
  ).toBeVisible();
  expect((await detail(context.request, p.id)).project.revision).toBe(0);
  await expect(
    page.getByRole("button", { name: "停止任务", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".message.assistant .agent-file-list"),
  ).toContainText("/components/Counter.tsx");
  await page.reload();
  await expect(
    page.locator(".message.assistant .agent-file-list"),
  ).toContainText("/components/Counter.tsx");
  expect((await detail(context.request, p.id)).project.revision).toBe(1);
});
test("stopping after a candidate arrives never commits partial files", async ({
  page,
  context,
}) => {
  const p = await create(context.request, "Stop candidate");
  await page.goto(`/projects/${p.id}`);
  await page
    .getByRole("textbox", { name: "给构建助手发消息" })
    .fill("E2E_FILE_PROGRESS");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".agent-progress .agent-file-list")).toContainText(
    "/components/Counter.tsx",
  );
  await page.getByRole("button", { name: "停止任务", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeEnabled();
  const saved = (await detail(context.request, p.id)).project;
  expect(saved.revision).toBe(0);
  expect(saved.working_files).toEqual(p.working_files);
});
