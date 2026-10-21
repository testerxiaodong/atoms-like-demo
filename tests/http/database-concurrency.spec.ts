import { expect } from "@playwright/test";
import { test } from "../support/auth";
import { database } from "../support/database";
test.beforeEach(() =>
  test.skip(!process.env.CLOUD_TEST_URL, "Cloud database suite"),
);
const files = {
  "/App.tsx": "export default function App(){return <h1>cloud race</h1>}",
};
test("cloud concurrent restore and save produce exactly one new version", async ({
  context,
}) => {
  const api = context.request,
    p = (
      await (
        await api.post("/api/projects", {
          data: { name: "cloud restore race" },
        })
      ).json()
    ).project;
  const version = (
    await (
      await api.post(`/api/projects/${p.id}/save`, {
        data: { revision: 0, files },
      })
    ).json()
  ).version;
  const results = await Promise.all([
    api.post(`/api/projects/${p.id}/save`, {
      data: {
        revision: 1,
        files: {
          "/App.tsx": "export default function App(){return <p>new</p>}",
        },
      },
    }),
    api.post(`/api/projects/${p.id}/restore`, {
      data: { revision: 1, versionId: version.id },
    }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const state = await (await api.get(`/api/projects/${p.id}`)).json();
  expect(state.project.revision).toBe(2);
  expect(state.messages).toHaveLength(2);
  expect(
    (await (await api.get(`/api/projects/${p.id}/versions`)).json()).versions,
  ).toHaveLength(2);
});
test("cloud stop versus completion is atomic and a late result cannot overwrite a later save", async ({
  context,
}) => {
  const api = context.request,
    db = await database();
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = (
      await (
        await api.post("/api/projects", {
          data: { name: "cloud stop commit race" },
        })
      ).json()
    ).project;
    const run = await db.rpc("start_run", {
      p_project_id: p.id,
      p_revision: 0,
      p_request_key: crypto.randomUUID(),
      p_prompt: "race",
    });
    expect(run.error).toBeNull();
    const args = {
      p_project_id: p.id,
      p_revision: 0,
      p_run_id: run.data.id,
      p_files: files,
      p_summary: "race",
      p_source: "ai",
    };
    const [stop, commit] = await Promise.all([
      api.post(`/api/projects/${p.id}/runs/${run.data.id}`, { data: {} }),
      db.rpc("commit_version", args),
    ]);
    expect(stop.status()).toBe(200);
    const state = await (await api.get(`/api/projects/${p.id}`)).json();
    expect(state.project.active_run_id).toBeNull();
    expect(state.project.revision).toBe(commit.error ? 0 : 1);
    if (commit.error) expect(commit.error.message).toContain("RUN_EXPIRED");
    const currentRun = (
      await (await api.get(`/api/projects/${p.id}/runs/${run.data.id}`)).json()
    ).run;
    expect(currentRun.status).toBe(commit.error ? "failed" : "completed");
    expect(
      (
        await api.post(`/api/projects/${p.id}/save`, {
          data: { revision: state.project.revision, files },
        })
      ).status(),
    ).toBe(200);
    expect((await db.rpc("commit_version", args)).error).not.toBeNull();
    expect(
      (await (await api.get(`/api/projects/${p.id}`)).json()).project.revision,
    ).toBe(state.project.revision + 1);
  }
});
