import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { files, uuid, root, create, detail, save } from "../support/http";
test("HTTP save validates revisions, source files, imports and protected paths without mutation", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  for (const revision of [-1, 0.5, "0", null])
    expect(
      (
        await api.post(`${root}/${p.id}/save`, {
          data: { revision, files: files() },
        })
      ).status(),
    ).toBe(400);
  for (const source of [
    {},
    { "/App.tsx": "export default <" },
    { ...files(), "/package.json": "{}" },
    { "/App.tsx": 'import x from "./missing";export default x' },
  ])
    expect(
      (
        await api.post(`${root}/${p.id}/save`, {
          data: { revision: 0, files: source },
        })
      ).status(),
    ).toBe(400);
  expect((await detail(api, p.id)).project.revision).toBe(0);
  expect(
    (await (await api.get(`${root}/${p.id}/versions`)).json()).versions,
  ).toHaveLength(0);
});
test("HTTP invalid and unknown IDs produce 404; restore parameters are validated", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  for (const id of ["bad", uuid()]) {
    expect((await api.get(`${root}/${id}`)).status()).toBe(404);
    for (const path of [`versions/${id}`, `runs/${id}`])
      expect((await api.get(`${root}/${p.id}/${path}`)).status()).toBe(404);
    expect(
      (await api.post(`${root}/${p.id}/runs/${id}`, { data: {} })).status(),
    ).toBe(404);
  }
  for (const data of [
    { versionId: "bad", revision: 0 },
    { versionId: uuid(), revision: -1 },
  ])
    expect((await api.post(`${root}/${p.id}/restore`, { data })).status()).toBe(
      400,
    );
  expect(
    (
      await api.post(`${root}/${p.id}/restore`, {
        data: { versionId: uuid(), revision: 0 },
      })
    ).status(),
  ).toBe(404);
});
test("HTTP concurrent saves at the same revision yield exactly one commit and one conflict", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  const results = await Promise.all([
    save(api, p.id, 0, "A"),
    save(api, p.id, 0, "B"),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const data = await detail(api, p.id);
  expect(data.project.revision).toBe(1);
  expect(data.messages).toHaveLength(1);
  expect(
    (await (await api.get(`${root}/${p.id}/versions`)).json()).versions,
  ).toHaveLength(1);
  const winner = await results.find((r) => r.status() === 200)!.json();
  expect(data.project.working_files).toEqual(winner.project.working_files);
});

test("HTTP version list returns metadata and timing without source snapshots", async ({
  context,
}) => {
  const p = await create(context.request);
  expect((await save(context.request, p.id)).status()).toBe(200);
  const response = await context.request.get(`${root}/${p.id}/versions`);
  expect(response.status()).toBe(200);
  expect(response.headers()["server-timing"]).toMatch(
    /auth;dur=[\d.]+, database;dur=[\d.]+, app;dur=[\d.]+/,
  );
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const body = await response.json();
  expect(body.versions).toHaveLength(1);
  expect(body.versions[0]).not.toHaveProperty("files");
  expect((await context.request.get(`${root}/bad/versions`)).status()).toBe(
    404,
  );
  expect(
    (await context.request.get(`${root}/${uuid()}/versions`)).status(),
  ).toBe(404);
});
