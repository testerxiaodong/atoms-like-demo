import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { files } from "../support/http";
test("HTTP public preview validates source, size and import boundaries", async ({
  context,
}) => {
  const api = context.request;
  expect(
    (await api.post("/api/preview", { data: { files: files() } })).status(),
  ).toBe(200);
  for (const data of [
    { files: {} },
    { files: { "/App.tsx": "export default <" } },
    { files: { "/App.tsx": 'import fs from "node:fs";export default fs' } },
  ])
    expect((await api.post("/api/preview", { data })).status()).toBe(400);
  expect((await api.post("/api/preview", { data: "{" })).status()).toBe(400);
  expect(
    (
      await api.post("/api/preview", {
        data: { files: files("x".repeat(400001)) },
      })
    ).status(),
  ).toBe(413);
});
test("HTTP preview rejects null and non-object payloads as client errors", async ({
  context,
}) => {
  for (const data of ["null", "[]", "42", '"text"'])
    expect(
      (
        await context.request.post("/api/preview", {
          data,
          headers: { "Content-Type": "application/json" },
        })
      ).status(),
    ).toBe(400);
});
