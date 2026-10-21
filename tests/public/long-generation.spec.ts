import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

test("fixed-domain long generation delivers keepalives, persists and previews a real application", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
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
  const { error } = await auth.auth.signInWithPassword({
    email: process.env.CLOUD_TEST_EMAIL!,
    password: process.env.CLOUD_TEST_PASSWORD!,
  });
  if (error) throw error;
  await page.addInitScript(() => {
    type Metrics = {
      started: number;
      headersMs: number;
      chunks: number;
      heartbeats: number;
      maxGapMs: number;
      last: number;
      finished: number;
      terminal: string;
      error: string;
    };
    const state = { stream: null as Metrics | null, longTasks: [] as number[] };
    Object.assign(window, { __publicRegression: state });
    new PerformanceObserver((list) => {
      state.longTasks.push(...list.getEntries().map((e) => e.duration));
    }).observe({ type: "longtask", buffered: true });
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (!String(args[0]).endsWith("/chat")) return original(...args);
      const started = performance.now();
      const stats: Metrics = {
        started,
        headersMs: 0,
        chunks: 0,
        heartbeats: 0,
        maxGapMs: 0,
        last: started,
        finished: 0,
        terminal: "",
        error: "",
      };
      state.stream = stats;
      try {
        const response = await original(...args);
        stats.headersMs = performance.now() - started;
        let pending = "";
        const decoder = new TextDecoder();
        const body = response.body!.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              const now = performance.now();
              stats.maxGapMs = Math.max(stats.maxGapMs, now - stats.last);
              stats.last = now;
              stats.chunks++;
              pending += decoder.decode(chunk, { stream: true });
              const lines = pending.split("\n");
              pending = lines.pop()!;
              for (const line of lines) {
                if (!line.trim()) {
                  stats.heartbeats++;
                  continue;
                }
                try {
                  const event = JSON.parse(line);
                  if (event.type === "done" || event.type === "error") {
                    stats.terminal = event.type;
                    stats.error = event.type === "error" ? event.message : "";
                  }
                } catch {}
              }
              controller.enqueue(chunk);
            },
            flush() {
              stats.finished = performance.now();
            },
          }),
        );
        return new Response(body, {
          status: response.status,
          headers: response.headers,
        });
      } catch (e) {
        stats.error = String(e);
        throw e;
      }
    };
  });
  const started = Date.now();
  await page.goto("/");
  const homeLoadMs = Date.now() - started;
  await page
    .getByRole("textbox", { name: "描述你的应用" })
    .fill(
      "创建一个可玩的精致贪吃蛇应用，标题为“长任务回归贪吃蛇”。需要20×20棋盘、方向键和WASD控制、触屏方向按钮、空格暂停、重开、三档难度、分数与浏览器最高分、撞墙撞身检测、失焦暂停。用组件、hook、纯逻辑和类型拆分6到8个有实际职责的文件，界面适配手机。请提供简短中文进展。开始按钮文字固定为“开始游戏”，暂停按钮固定为“暂停游戏”。",
    );
  await page.getByRole("button", { name: "开始构建" }).click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/);
  const projectURL = page.url();
  let savedMetrics: unknown = null;
  try {
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const state = (
              window as unknown as {
                __publicRegression: {
                  stream: { terminal: string; error: string } | null;
                };
              }
            ).__publicRegression;
            return (
              state?.stream?.terminal ||
              (document.querySelector('[role="alert"]')?.textContent
                ? "ui-error"
                : "")
            );
          }),
        { timeout: 330_000, intervals: [2000] },
      )
      .toBe("done");
    const frame = page.frameLocator('iframe[title="应用实时预览"]');
    await expect(
      frame.getByRole("heading", { name: /长任务回归\s*贪吃蛇/ }),
    ).toBeVisible();
    await frame.getByRole("button", { name: "开始游戏", exact: true }).click();
    await expect(
      frame.getByRole("button", { name: "暂停游戏", exact: true }),
    ).toBeVisible();
    await frame.getByRole("button", { name: "暂停游戏", exact: true }).click();
    const stats = await page.evaluate(
      () =>
        (
          window as unknown as {
            __publicRegression: {
              stream: {
                started: number;
                last: number;
                headersMs: number;
                maxGapMs: number;
                chunks: number;
                heartbeats: number;
                terminal: string;
              };
              longTasks: number[];
            };
          }
        ).__publicRegression,
    );
    savedMetrics = stats;
    const codeStart = Date.now();
    await page.getByRole("button", { name: "代码", exact: true }).click();
    await expect(page.locator(".cm-content")).toBeVisible();
    const codeSwitchMs = Date.now() - codeStart;
    const previewStart = Date.now();
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(
      frame.getByRole("heading", { name: /长任务回归\s*贪吃蛇/ }),
    ).toBeVisible();
    const previewSwitchMs = Date.now() - previewStart;
    const durationMs = stats.stream.last - stats.stream.started;
    console.log(
      JSON.stringify(
        {
          homeLoadMs,
          codeSwitchMs,
          previewSwitchMs,
          durationMs,
          headersMs: stats.stream.headersMs,
          maxGapMs: stats.stream.maxGapMs,
          heartbeats: stats.stream.heartbeats,
          chunks: stats.stream.chunks,
          longTasks: stats.longTasks.length,
          maxLongTaskMs: Math.max(0, ...stats.longTasks),
        },
        null,
        2,
      ),
    );
    expect(stats.stream.heartbeats).toBeGreaterThanOrEqual(10);
    expect(stats.stream.maxGapMs).toBeLessThan(25_000);
    // A fast success must not be reported as proof of long-connection coverage.
    expect(
      durationMs,
      "Generation finished too quickly to cover a >=120s public connection; repeat this release check.",
    ).toBeGreaterThanOrEqual(120_000);
    const state = await (
      await page.request.get(projectURL.replace("/projects/", "/api/projects/"))
    ).json();
    expect(state.project.revision).toBe(1);
    expect(state.project.active_run_id).toBeNull();
    await page.reload();
    await expect(
      frame.getByRole("heading", { name: /长任务回归\s*贪吃蛇/ }),
    ).toBeVisible();
  } finally {
    const metrics = await page
      .evaluate(
        () =>
          (window as unknown as { __publicRegression: unknown })
            .__publicRegression,
      )
      .catch(() => null);
    await testInfo.attach("public-stream-metrics", {
      body: JSON.stringify({ homeLoadMs, metrics: savedMetrics ?? metrics }),
      contentType: "application/json",
    });
    const response = await page.request.get(
      projectURL.replace("/projects/", "/api/projects/"),
    );
    if (response.ok()) {
      const { project } = await response.json();
      if (project.active_run_id)
        await page.request.post(
          `/api/projects/${project.id}/runs/${project.active_run_id}`,
          { data: {} },
        );
    }
  }
});
