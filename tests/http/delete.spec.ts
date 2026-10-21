import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { create, save, root, startSlow } from "../support/http";

test("HTTP delete removes saved project and rejects repeat/invalid IDs", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  expect((await save(api, p.id)).status()).toBe(200);
  expect((await api.delete(`${root}/${p.id}`)).status()).toBe(204);
  expect((await api.get(`${root}/${p.id}`)).status()).toBe(404);
  expect((await api.get(`${root}/${p.id}/versions`)).status()).toBe(404);
  expect((await api.delete(`${root}/${p.id}`)).status()).toBe(404);
  expect((await api.delete(`${root}/invalid-id`)).status()).toBe(404);
  expect(
    (await (await api.get(root)).json()).projects.some(
      (item: { id: string }) => item.id === p.id,
    ),
  ).toBe(false);
});
test("HTTP running project cannot be deleted until stopped", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  const { pending, runId } = await startSlow(api, p.id);
  try {
    expect((await api.delete(`${root}/${p.id}`)).status()).toBe(409);
  } finally {
    await api.post(`${root}/${p.id}/runs/${runId}`);
    await pending;
  }
  expect((await api.delete(`${root}/${p.id}`)).status()).toBe(204);
});
