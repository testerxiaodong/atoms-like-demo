import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { create, detail, save, chat } from "../support/http";
for (const [name, expected] of [
  ["HTTP_DB_NETWORK", "连接"],
  ["HTTP_DB_MISSING", "迁移"],
])
  test(`HTTP ${name} reports a failed commit, preserves state and recovers on retry`, async ({
    context,
  }) => {
    test.skip(
      !!process.env.CLOUD_TEST_URL,
      "Destructive database faults stay in the isolated adapter",
    );
    const api = context.request,
      p = await create(api, name);
    const r = await save(api, p.id);
    expect(r.status()).toBe(503);
    expect((await r.json()).error).toContain(expected);
    const before = await detail(api, p.id);
    expect(before.project.revision).toBe(0);
    expect(before.messages).toHaveLength(0);
    expect((await save(api, p.id)).status()).toBe(200);
    expect((await detail(api, p.id)).project.revision).toBe(1);
  });
test("HTTP AI commit failure produces an error event, clears the run lock and allows retry", async ({
  context,
}) => {
  test.skip(
    !!process.env.CLOUD_TEST_URL,
    "Destructive database faults stay in the isolated adapter",
  );
  const api = context.request,
    p = await create(api, "HTTP_DB_NETWORK");
  const r = await chat(api, p.id, "E2E_SUCCESS");
  const body = await r.text();
  expect(body).toContain('"type":"error"');
  expect(body).not.toContain('"type":"done"');
  expect(body).toContain("连接");
  const failed = await detail(api, p.id);
  expect(failed.project).toMatchObject({ revision: 0, active_run_id: null });
  expect(
    failed.messages.some((m: { role: string }) => m.role === "assistant"),
  ).toBe(false);
  expect(await (await chat(api, p.id, "E2E_SUCCESS")).text()).toContain(
    '"type":"done"',
  );
  expect((await detail(api, p.id)).project.revision).toBe(1);
});
