import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

test("fixed-domain long generation delivers keepalives, persists and previews a real application", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(720_000);
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
      mode?: "polling";
      polls?: number;
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
      if (
        String(args[0]).includes("/runs/") &&
        (!args[1]?.method || args[1].method === "GET")
      ) {
        const response = await original(...args);
        if (state.stream?.mode === "polling" && response.ok) {
          const data = await response.clone().json();
          const stats = state.stream,
            now = performance.now();
          stats.polls = (stats.polls ?? 0) + 1;
          stats.maxGapMs = Math.max(stats.maxGapMs, now - stats.last);
          stats.last = now;
          if (data.run?.status === "completed") {
            stats.terminal = "done";
            stats.finished = now;
          }
          if (data.run?.status === "failed") {
            stats.terminal = "error";
            stats.error = data.run.error;
          }
        }
        return response;
      }
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
        if (response.status === 202) {
          stats.mode = "polling";
          stats.polls = 0;
          return response;
        }
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
      "创建一个可玩的精致贪吃蛇应用，标题为“长任务回归贪吃蛇”。需要20×20棋盘、方向键和WASD控制、触屏方向按钮、空格暂停、重开、三档难度、分数与浏览器最高分、撞墙撞身检测、失焦暂停。用组件、hook、纯逻辑和类型拆分6到8个有实际职责的文件，界面适配手机，总代码控制在400行以内，避免冗长样式。请提供简短中文进展。开始按钮文字固定为“开始游戏”，暂停按钮固定为“暂停游戏”。",
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
        { timeout: 650_000, intervals: [2000] },
      )
      .not.toBe("");
    const terminal = await page.evaluate(
      () =>
        (
          window as unknown as {
            __publicRegression: { stream: { terminal: string; error: string } };
          }
        ).__publicRegression.stream,
    );
    expect(terminal.terminal, terminal.error).toBe("done");
    const stats = await page.evaluate(
      () =>
        (
          window as unknown as {
            __publicRegression: {
              stream: {
                mode?: "polling";
                polls?: number;
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
    console.log("Generation finished:", JSON.stringify(stats.stream));
    const frame = page.frameLocator('iframe[title="应用实时预览"]');
    await expect(
      frame.getByRole("heading", { name: /长任务回归\s*贪吃蛇/ }),
    ).toBeVisible();
    // Generated layouts may repeat controls. Prefer a control whose center is
    // inside the iframe viewport instead of a clipped overlay below the board.
    async function clickGameButton(name: string) {
      const buttons = frame.getByRole("button", { name, exact: true });
      await expect(buttons.first()).toBeVisible();
      for (let i = 0; i < (await buttons.count()); i++) {
        const button = buttons.nth(i);
        const inViewport = await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.x + r.width / 2 >= 0 &&
            r.x + r.width / 2 < innerWidth &&
            r.y + r.height / 2 >= 0 &&
            r.y + r.height / 2 < innerHeight
          );
        });
        if (inViewport) {
          await button.click();
          return;
        }
      }
      await buttons.first().click();
    }
    console.log("Preview rendered; testing game controls");
    await clickGameButton("开始游戏");
    await clickGameButton("暂停游戏");
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
    if (stats.stream.mode === "polling")
      expect(stats.stream.polls).toBeGreaterThanOrEqual(10);
    else expect(stats.stream.heartbeats).toBeGreaterThanOrEqual(10);
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
    console.log(
      "Public stream evidence:",
      JSON.stringify({ homeLoadMs, metrics: savedMetrics ?? metrics }),
    );
    await testInfo.attach("public-stream-metrics", {
      body: JSON.stringify({ homeLoadMs, metrics: savedMetrics ?? metrics }),
      contentType: "application/json",
    });
    const response = await page.request
      .get(projectURL.replace("/projects/", "/api/projects/"), {
        timeout: 10_000,
      })
      .catch(() => null);
    if (response?.ok()) {
      const { project } = await response.json();
      if (project.active_run_id)
        await page.request
          .post(`/api/projects/${project.id}/runs/${project.active_run_id}`, {
            data: {},
            timeout: 10_000,
          })
          .catch(() => null);
    }
  }
});
