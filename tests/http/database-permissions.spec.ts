import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { database } from "../support/database";
test.beforeEach(() =>
  test.skip(!process.env.CLOUD_TEST_URL, "Cloud database suite"),
);
const files = {
  "/App.tsx": "export default function App(){return <h1>cloud race</h1>}",
};
test("cloud direct PostgREST RLS and RPC ownership reject another user and direct writes", async ({
  context,
}) => {
  const api = context.request;
  const p = (
    await (
      await api.post("/api/projects", { data: { name: "cloud RLS" } })
    ).json()
  ).project;
  expect(
    (
      await api.post(`/api/projects/${p.id}/save`, {
        data: { revision: 0, files },
      })
    ).status(),
  ).toBe(200);
  const owner = await database(),
    other = await database(true);
  const run = await owner.rpc("start_run", {
    p_project_id: p.id,
    p_request_key: crypto.randomUUID(),
    p_revision: 1,
    p_prompt: "RLS test",
  });
  expect(run.error).toBeNull();
  for (const table of ["projects", "versions", "messages", "runs"]) {
    const result = await other
      .from(table)
      .select("*")
      .eq(table === "projects" ? "id" : "project_id", p.id);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  }
  for (const [name, args] of [
    ["rename_project", { p_project_id: p.id, p_name: "forbidden" }],
    ["delete_project", { p_project_id: p.id }],
    [
      "start_run",
      {
        p_project_id: p.id,
        p_request_key: crypto.randomUUID(),
        p_revision: 1,
        p_prompt: "forbidden",
      },
    ],
    [
      "fail_run",
      { p_project_id: p.id, p_run_id: run.data.id, p_error: "forbidden" },
    ],
    [
      "commit_version",
      {
        p_project_id: p.id,
        p_revision: 1,
        p_files: files,
        p_summary: "forbidden",
        p_source: "manual",
      },
    ],
  ] as const)
    expect((await other.rpc(name, args)).error?.message).toContain("NOT_FOUND");
  expect(
    (await owner.from("projects").update({ name: "bypass" }).eq("id", p.id))
      .error,
  ).not.toBeNull();
  expect(
    (
      await owner.rpc("fail_run", {
        p_project_id: p.id,
        p_run_id: run.data.id,
        p_error: "test cleanup",
      })
    ).error,
  ).toBeNull();
  expect(
    (await (await api.get(`/api/projects/${p.id}`)).json()).project,
  ).toMatchObject({ name: "cloud RLS", revision: 1, active_run_id: null });
});
