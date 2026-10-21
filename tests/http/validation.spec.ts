import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { root, create, detail } from "../support/http";
for (const name of ["", "  ", "x".repeat(81), null, 42])
  test(`HTTP invalid project name ${JSON.stringify(name)}`, async ({
    context,
  }) => {
    const api = context.request;
    expect((await api.post(root, { data: { name } })).status()).toBe(400);
    const p = await create(api);
    expect(
      (await api.patch(`${root}/${p.id}`, { data: { name } })).status(),
    ).toBe(400);
    expect((await detail(api, p.id)).project.name).toBe("HTTP test");
  });
test("HTTP rejects malformed JSON and oversized request bodies", async ({
  context,
}) => {
  const api = context.request;
  expect(
    (
      await api.post(root, {
        data: "{",
        headers: { "Content-Type": "application/json" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await api.post(root, { data: { name: "x".repeat(400001) } })).status(),
  ).toBe(413);
});
