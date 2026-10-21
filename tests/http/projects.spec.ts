import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { files, root, create, detail, save } from "../support/http";
test("HTTP create/list/read/rename/save/versions/restore/preview persists authoritative state", async ({
  context,
}) => {
  const api = context.request,
    p = await create(api);
  expect(
    (await (await api.get(root)).json()).projects.some(
      (x: { id: string }) => x.id === p.id,
    ),
  ).toBe(true);
  expect(
    (
      await api.patch(`${root}/${p.id}`, { data: { name: "renamed" } })
    ).status(),
  ).toBe(200);
  const first = await save(api, p.id);
  expect(first.status()).toBe(200);
  const v = (await first.json()).version;
  expect((await save(api, p.id, 1, "second")).status()).toBe(200);
  const list = await (await api.get(`${root}/${p.id}/versions`)).json();
  expect(list.versions).toHaveLength(2);
  expect(
    (await (await api.get(`${root}/${p.id}/versions/${v.id}`)).json()).version
      .files,
  ).toEqual(files("saved"));
  const restored = await api.post(`${root}/${p.id}/restore`, {
    data: { revision: 2, versionId: v.id },
  });
  expect(restored.status()).toBe(200);
  const final = await detail(api, p.id);
  expect(final.project).toMatchObject({
    name: "renamed",
    revision: 3,
    working_files: files("saved"),
  });
  expect(final.messages).toHaveLength(3);
  const preview = await api.get(`${root}/${p.id}/preview`);
  expect(preview.status()).toBe(200);
  expect(await preview.text()).toContain("saved");
  expect(preview.headers()["content-security-policy"]).toContain(
    "sandbox allow-scripts",
  );
});
