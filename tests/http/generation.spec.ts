import { expect } from "@playwright/test";
import { test } from "../support/auth";
import {
  uuid,
  root,
  create,
  detail,
  save,
  chat,
  startSlow,
} from "../support/http";
test("HTTP chat validates prompt, revision and request key before allocating a run", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api),
    valid = { prompt: "hello", revision: 0, requestKey: uuid() };
  for (const bad of [
    { prompt: "" },
    { prompt: " ".repeat(3) },
    { prompt: "x".repeat(4001) },
    { revision: -1 },
    { revision: "0" },
    { requestKey: "bad" },
  ])
    expect(
      (
        await api.post(`${root}/${p.id}/chat`, { data: { ...valid, ...bad } })
      ).status(),
    ).toBe(400);
  const data = await detail(api, p.id);
  expect(data.messages).toHaveLength(0);
  expect(data.project.active_run_id).toBeNull();
});
test("HTTP active generation blocks another run and manual writes; stopping is idempotent and permits retry", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api),
    { pending, runId } = await startSlow(api, p.id);
  try {
    expect((await chat(api, p.id, "E2E_SUCCESS")).status()).toBe(409);
    expect((await save(api, p.id)).status()).toBe(409);
    expect((await api.get(`${root}/${p.id}/runs/${runId}`)).status()).toBe(200);
  } finally {
    expect(
      (await api.post(`${root}/${p.id}/runs/${runId}`, { data: {} })).status(),
    ).toBe(200);
    await pending;
  }
  expect(
    (await api.post(`${root}/${p.id}/runs/${runId}`, { data: {} })).status(),
  ).toBe(200);
  expect((await detail(api, p.id)).project).toMatchObject({
    revision: 0,
    active_run_id: null,
  });
  const retry = await chat(api, p.id, "E2E_SUCCESS");
  expect(await retry.text()).toContain('"type":"done"');
  expect((await detail(api, p.id)).project.revision).toBe(1);
});
test("HTTP duplicate request keys cannot produce duplicate turns", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api),
    key = uuid();
  expect(await (await chat(api, p.id, "你好", 0, key)).text()).toContain(
    '"type":"done"',
  );
  expect((await chat(api, p.id, "你好", 0, key)).status()).toBe(409);
  expect((await detail(api, p.id)).messages).toHaveLength(2);
});
test("HTTP model failure sends a terminal error, releases lock and accepts a retry", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api),
    r = await chat(api, p.id, "E2E_FAIL");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("application/x-ndjson");
  const body = await r.text();
  expect(body).toContain('"type":"error"');
  expect(body).not.toContain('"type":"done"');
  expect((await detail(api, p.id)).project).toMatchObject({
    revision: 0,
    active_run_id: null,
  });
  expect(await (await chat(api, p.id, "E2E_SUCCESS")).text()).toContain(
    '"type":"done"',
  );
});
test("HTTP two simultaneous generation requests allocate only one active run", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  const first = chat(api, p.id, "E2E_SLOW"),
    second = chat(api, p.id, "E2E_SLOW");
  let runId = "";
  try {
    const rejected = await Promise.race([first, second]);
    expect(rejected.status()).toBe(409);
    const data = await detail(api, p.id);
    runId = data.project.active_run_id;
    expect(runId).toBeTruthy();
    expect(
      data.messages.filter((m: { role: string }) => m.role === "user"),
    ).toHaveLength(1);
  } finally {
    runId ||= (await detail(api, p.id)).project.active_run_id;
    if (runId) await api.post(`${root}/${p.id}/runs/${runId}`, { data: {} });
    await Promise.all([first, second]);
  }
  expect((await detail(api, p.id)).project).toMatchObject({
    revision: 0,
    active_run_id: null,
  });
});
test("HTTP silent generation sends keepalives before completion and can still be stopped", async ({
  context,
  baseURL,
}) => {
  const p = await create(context.request, "heartbeat regression");
  const cookie = (await context.cookies(baseURL!))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const response = await fetch(`${baseURL}${root}/${p.id}/chat`, {
    method: "POST",
    headers: { cookie, origin: baseURL!, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "E2E_SLOW",
      revision: 0,
      requestKey: uuid(),
    }),
    signal: AbortSignal.timeout(25000),
  });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  let buffer = "",
    runId = "";
  try {
    while (!buffer.includes("\n\n")) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      buffer += new TextDecoder().decode(chunk.value);
      for (const line of buffer.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (event.type === "run") runId = event.id;
        } catch {}
      }
    }
    expect(runId).toBeTruthy();
    expect(buffer).not.toContain('"type":"done"');
    expect((await detail(context.request, p.id)).project.active_run_id).toBe(
      runId,
    );
  } finally {
    const id =
      runId || (await detail(context.request, p.id)).project.active_run_id;
    if (id)
      await context.request.post(`${root}/${p.id}/runs/${id}`, { data: {} });
    await reader.cancel();
  }
  await expect
    .poll(
      async () => (await detail(context.request, p.id)).project.active_run_id,
    )
    .toBeNull();
});
