import { expect, request as http } from "@playwright/test";
import { test } from "../support/auth";
import {
  uuid,
  root,
  create,
  detail,
  save,
  startSlow,
} from "../support/http";
import { createServerClient } from "@supabase/ssr";
test("HTTP anonymous callers cannot access any private read or write endpoint", async ({
  context,
}) => {
  const p = await create(context.request);
  const anon = await http.newContext({ baseURL: "http://localhost:3001" });
  try {
    for (const [method, path] of [
      ["GET", root],
      ["POST", root],
      ["GET", `${root}/${p.id}`],
      ["PATCH", `${root}/${p.id}`],
      ["POST", `${root}/${p.id}/save`],
      ["POST", `${root}/${p.id}/chat`],
      ["POST", `${root}/${p.id}/restore`],
      ["GET", `${root}/${p.id}/versions`],
      ["GET", `${root}/${p.id}/versions/${uuid()}`],
      ["GET", `${root}/${p.id}/runs/${uuid()}`],
      ["POST", `${root}/${p.id}/runs/${uuid()}`],
      ["GET", `${root}/${p.id}/preview`],
    ])
      expect(
        (await anon.fetch(path, { method })).status(),
        `${method} ${path}`,
      ).toBe(401);
  } finally {
    await anon.dispose();
  }
});
test("HTTP second account cannot read, change, generate, restore, stop or preview another project", async ({
  context,
  browser,
}) => {
  const api = context.request,
    p = await create(api),
    s = await save(api, p.id),
    v = (await s.json()).version.id,
    other = await browser.newContext();
  try {
    const auth = createServerClient(
      process.env.CLOUD_TEST_URL || "http://localhost:54329",
      process.env.CLOUD_TEST_KEY || "local-test-key",
      {
        cookies: {
          getAll: () => [],
          setAll: async (values) => {
            await other.addCookies(
              values.map(({ name, value }) => ({
                name,
                value,
                domain: "localhost",
                path: "/",
                sameSite: "Lax" as const,
              })),
            );
          },
        },
      },
    );
    expect(
      (
        await auth.auth.signInWithPassword({
          email: process.env.CLOUD_TEST_OTHER_EMAIL || "other@example.test",
          password: process.env.CLOUD_TEST_PASSWORD || "local-e2e-only",
        })
      ).error,
    ).toBeNull();
    for (const [method, path] of [
      ["GET", ""],
      ["PATCH", ""],
      ["POST", "/save"],
      ["POST", "/chat"],
      ["POST", "/restore"],
      ["GET", "/versions"],
      ["GET", `/versions/${v}`],
      ["GET", `/runs/${uuid()}`],
      ["POST", `/runs/${uuid()}`],
      ["GET", "/preview"],
    ])
      expect(
        (
          await other.request.fetch(
            `http://localhost:3001${root}/${p.id}${path}`,
            { method },
          )
        ).status(),
      ).toBe(404);
    const list = await (
      await other.request.get(`http://localhost:3001${root}`)
    ).json();
    expect(list.projects.some((x: { id: string }) => x.id === p.id)).toBe(
      false,
    );
    expect((await detail(api, p.id)).project.revision).toBe(1);
  } finally {
    await other.close();
  }
});
test("HTTP version and run IDs cannot be mixed across projects owned by the same user", async ({
  context,
}) => {
  const api = context.request,
    a = await create(api),
    b = await create(api),
    v = (await (await save(api, a.id)).json()).version.id;
  expect((await api.get(`${root}/${b.id}/versions/${v}`)).status()).toBe(404);
  expect(
    (
      await api.post(`${root}/${b.id}/restore`, {
        data: { versionId: v, revision: 0 },
      })
    ).status(),
  ).toBe(404);
  const { pending, runId } = await startSlow(api, a.id);
  try {
    expect((await api.get(`${root}/${b.id}/runs/${runId}`)).status()).toBe(404);
    expect(
      (await api.post(`${root}/${b.id}/runs/${runId}`, { data: {} })).status(),
    ).toBe(404);
  } finally {
    await api.post(`${root}/${a.id}/runs/${runId}`, { data: {} });
    await pending;
  }
});
test("HTTP rejects cross-origin local subscription calls before starting a run", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  const response = await api.post(`${root}/${p.id}/chat`, {
    headers: { origin: "https://untrusted.example" },
    data: { prompt: "hi", revision: 0, requestKey: uuid() },
  });
  expect(response.status()).toBe(403);
  expect((await detail(api, p.id)).messages).toHaveLength(0);
});
