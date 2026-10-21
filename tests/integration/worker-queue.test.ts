import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
let project: string;
const files = { "/App.tsx": "export default function App(){return null}" };
beforeAll(async () => {
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    insert into auth.users values('${owner}'),('${other}');`);
  for (const name of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await asUser(owner);
  project = (
    await db.query<{ id: string }>(
      "select id from create_project('queue test',$1)",
      [JSON.stringify(files)],
    )
  ).rows[0].id;
});
afterAll(() => db.close());
async function asUser(id: string) {
  await db.exec(
    `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
  );
}
async function claim() {
  await db.exec("reset role;set role service_role;");
  return (
    await db.query<{
      job: { runId: string; claimId: string; files: typeof files } | null;
    }>("select claim_generation() as job")
  ).rows[0].job;
}
async function enqueue(revision = 0) {
  await asUser(owner);
  return db.query<{ id: string }>(
    "select id from enqueue_generation($1,gen_random_uuid(),$2,'build','Current request: build')",
    [project, revision],
  );
}
async function update(
  job: { runId: string; claimId: string },
  result: typeof files | null = null,
) {
  await db.exec("reset role;set role service_role;");
  return (
    await db.query<{ data: { status: string } }>(
      "select update_generation($1,$2,'[\"progress\"]',$3,'done',null) as data",
      [job.runId, job.claimId, result && JSON.stringify(result)],
    )
  ).rows[0].data;
}
it("rejects offline enqueue without creating a run", async () => {
  await expect(enqueue()).rejects.toThrow("WORKER_OFFLINE");
  expect((await db.query("select * from runs")).rows).toHaveLength(0);
});
it("claim is service-only; ordinary users cannot bypass the worker boundary", async () => {
  await asUser(owner);
  await expect(db.query("select claim_generation()")).rejects.toThrow(
    "permission denied",
  );
  await expect(
    db.query(
      "select update_generation(gen_random_uuid(),gen_random_uuid(),'[]')",
    ),
  ).rejects.toThrow("permission denied");
  await expect(
    db.query("insert into generation_worker values(true,now())"),
  ).rejects.toThrow();
});
it("queues once, isolates the job, claims once and completes atomically", async () => {
  expect(await claim()).toBeNull();
  const run = await enqueue();
  await expect(enqueue()).rejects.toThrow("PROJECT_BUSY");
  await asUser(other);
  expect((await db.query("select * from generation_jobs")).rows).toHaveLength(
    0,
  );
  const job = (await claim())!;
  expect(job.runId).toBe(run.rows[0].id);
  expect(job.files).toEqual(files);
  expect(await claim()).toBeNull();
  await expect(
    update({ ...job, claimId: crypto.randomUUID() }, files),
  ).rejects.toThrow("NOT_FOUND");
  const changed = {
    "/App.tsx": "export default function App(){return <div>done</div>}",
  };
  expect((await update(job, changed)).status).toBe("completed");
  expect((await update(job, changed)).status).toBe("completed");
  await asUser(owner);
  expect((await db.query("select * from versions")).rows).toHaveLength(1);
  expect(
    (await db.query<{ revision: number }>("select revision from projects"))
      .rows[0].revision,
  ).toBe(1);
});
it("stop revokes a worker result; a new generation can run afterwards", async () => {
  await enqueue(1);
  const job = (await claim())!;
  await asUser(owner);
  await db.query("select fail_run($1,$2,'stopped')", [project, job.runId]);
  expect((await update(job, files)).status).toBe("cancelled");
  await asUser(owner);
  expect((await db.query("select * from versions")).rows).toHaveLength(1);
  await enqueue(1);
  const retry = (await claim())!;
  expect((await update(retry, files)).status).toBe("completed");
});
it("an expired worker result cannot change source or block a later run", async () => {
  await enqueue(2);
  const job = (await claim())!;
  await db.exec("reset role");
  await db.query(
    "update runs set expires_at=now()-interval '1 second' where id=$1",
    [job.runId],
  );
  expect((await update(job, files)).status).toBe("cancelled");
  await enqueue(2);
  const retry = (await claim())!;
  expect((await update(retry, files)).status).toBe("completed");
});
