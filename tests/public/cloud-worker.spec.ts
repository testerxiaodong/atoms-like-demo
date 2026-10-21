import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

test("cloud worker stop retry and interactive generated preview", async ({
  context,
  page,
  baseURL,
}) => {
  const url = new URL(baseURL!);
  const auth = createServerClient(
    process.env.CLOUD_TEST_URL!,
    process.env.CLOUD_TEST_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: async (values) => {
          await context.addCookies(
            values.map(({ name, value }) => ({
              name,
              value,
              domain: url.hostname,
              path: "/",
              secure: true,
              sameSite: "Lax",
            })),
          );
        },
      },
    },
  );
  const { data: session, error } = await auth.auth.signInWithPassword({
    email: process.env.CLOUD_TEST_EMAIL!,
    password: process.env.CLOUD_TEST_PASSWORD!,
  });
  if (error) throw error;
  test.setTimeout(720_000);
  expect((await context.request.post("/api/worker/jobs")).status()).toBe(401);
  const created = await context.request.post("/api/projects", {
    data: { name: "Cloud worker regression" },
  });
  expect(created.status()).toBe(201);
  const { project } = await created.json();
  expect(project.owner_id).toBe(session.user!.id);
  const root = `/api/projects/${project.id}`;
  const start = (prompt: string) =>
    context.request.post(`${root}/chat`, {
      data: { prompt, revision: 0, requestKey: crypto.randomUUID() },
    });
  const first = await start("创建一个包含多个界面与交互的贪吃蛇游戏");
  expect(first.status(), await first.text()).toBe(202);
  const firstId = (await first.json()).runId;
  await expect
    .poll(
      async () =>
        (await (await context.request.get(`${root}/runs/${firstId}`)).json())
          .steps.length,
      { timeout: 45_000 },
    )
    .toBeGreaterThan(0);
  expect(
    (
      await context.request.post(`${root}/runs/${firstId}`, { data: {} })
    ).status(),
  ).toBe(200);
  expect(
    (await (await context.request.get(root)).json()).project.revision,
  ).toBe(0);
  await page.goto(`/projects/${project.id}`);
  await page
    .getByRole("textbox", { name: "给构建助手发消息" })
    .fill(
      "做一个精简可交互计数器，页面标题云端计数器，有按钮加一、重置和可见数字，初始为0。用App.tsx和一个组件文件实现，保持简短，不要添加额外功能。",
    );
  const responsePromise = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `${root}/chat` &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const next = await responsePromise;
  expect(next.status()).toBe(202);
  const nextId = (await next.json()).runId;
  await expect(
    page.getByRole("button", { name: "停止任务", exact: true }),
  ).toBeVisible();
  // Reload during execution: the persisted cloud job must continue.
  await page.reload();
  const begun = performance.now();
  let progress = 0;
  await expect
    .poll(
      async () => {
        const state = await (
          await context.request.get(`${root}/runs/${nextId}`)
        ).json();
        progress = Math.max(progress, state.steps.length);
        if (state.run.status === "failed") throw new Error(state.run.error);
        return state.run.status;
      },
      { timeout: 640_000, intervals: [2000] },
    )
    .toBe("completed");
  const data = await (await context.request.get(root)).json();
  expect(data.project.revision).toBe(1);
  expect(progress).toBeGreaterThan(0);
  await page.goto(`/projects/${project.id}`);
  const preview = page.frameLocator('iframe[title="应用实时预览"]');
  await expect(
    preview.getByRole("button", { name: "加一", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await preview.getByRole("button", { name: "加一", exact: true }).click();
  await expect(preview.getByText("1", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "重置", exact: true }).click();
  await expect(preview.getByText("0", { exact: true })).toBeVisible();
  console.log(
    JSON.stringify({
      generationMs: Math.round(performance.now() - begun),
      progressSteps: progress,
      stoppedFirstRun: true,
      previewInteractive: true,
    }),
  );
});
