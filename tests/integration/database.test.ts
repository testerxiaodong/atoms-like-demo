import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
let project: string, version: string;
const files = { "/App.tsx": "export default function App(){return null}" };
beforeAll(async () => {
  await db.exec(
    `create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; insert into auth.users values ('${owner}'),('${other}');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610200001_initial.sql", "utf8"),
  );
  await db.exec(readFileSync("supabase/migrations/202610200002_conversation_turns.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/202610200003_local_run_timeout.sql", "utf8"));
  await db.exec(
    `set role authenticated; set request.jwt.claim.sub='${owner}';`,
  );
  const result = await db.query<{ id: string }>(
    "select id from create_project($1,$2::jsonb)",
    ["Test", JSON.stringify(files)],
  );
  project = result.rows[0].id;
});
afterAll(() => db.close());
it("commits snapshot and message together; rejects stale or null revisions", async () => {
  const result = await db.query<{
    data: { version: { id: string }; project: { revision: number } };
  }>("select commit_version($1,0,$2::jsonb,'first','manual') as data", [
    project,
    JSON.stringify(files),
  ]);
  version = result.rows[0].data.version.id;
  expect(result.rows[0].data.project.revision).toBe(1);
  await expect(
    db.query("select commit_version($1,0,$2::jsonb,'stale','manual')", [
      project,
      JSON.stringify(files),
    ]),
  ).rejects.toThrow("REVISION_CONFLICT");
  await expect(
    db.query("select commit_version($1,null,$2::jsonb,'null','manual')", [
      project,
      JSON.stringify(files),
    ]),
  ).rejects.toThrow("REVISION_CONFLICT");
  expect((await db.query("select * from versions")).rows).toHaveLength(1);
  expect((await db.query("select * from messages")).rows).toHaveLength(1);
});
it("blocks direct writes and isolates another user's reads and RPCs", async () => {
  await expect(
    db.query("update projects set revision=99 where id=$1", [project]),
  ).rejects.toThrow("permission denied");
  await db.exec(`set request.jwt.claim.sub='${other}'`);
  expect((await db.query("select * from projects")).rows).toHaveLength(0);
  expect((await db.query("select * from versions")).rows).toHaveLength(0);
  await expect(
    db.query("select rename_project($1,'stolen')", [project]),
  ).rejects.toThrow("NOT_FOUND");
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
});
it("locks competing writes during generation and leaves files intact on failure", async () => {
  const run = await db.query<{ id: string }>(
    "select id from start_run($1,gen_random_uuid(),1,'build')",
    [project],
  );
  const ttl = await db.query<{seconds:number}>("select extract(epoch from expires_at-created_at)::int as seconds from runs where id=$1", [run.rows[0].id]);
  expect(ttl.rows[0].seconds).toBe(310);
  await expect(
    db.query("select commit_version($1,1,$2::jsonb,'manual','manual')", [
      project,
      JSON.stringify(files),
    ]),
  ).rejects.toThrow("PROJECT_BUSY");
  await expect(
    db.query("select * from start_run($1,gen_random_uuid(),1,'compete')", [
      project,
    ]),
  ).rejects.toThrow("PROJECT_BUSY");
  await db.query("select fail_run($1,$2,'test interruption')", [
    project,
    run.rows[0].id,
  ]);
  const p = await db.query<{
    revision: number;
    working_files: unknown;
    active_run_id: string | null;
  }>("select * from projects where id=$1", [project]);
  expect(p.rows[0].revision).toBe(1);
  expect(p.rows[0].working_files).toEqual(files);
  expect(p.rows[0].active_run_id).toBeNull();
  await expect(db.query("select commit_version($1,1,$2::jsonb,'late result','ai',$3)", [project, JSON.stringify(files), run.rows[0].id])).rejects.toThrow('RUN_EXPIRED');
});
it("restores the stored snapshot into a new version, ignoring supplied files", async () => {
  await db.query("select commit_version($1,1,$2::jsonb,'second','manual')", [
    project,
    JSON.stringify({ "/App.tsx": "export default 2" }),
  ]);
  await db.query(
    "select commit_version($1,2,'{}'::jsonb,'restore','restore',null,$2)",
    [project, version],
  );
  const p = await db.query<{ revision: number; working_files: unknown }>(
    "select * from projects where id=$1",
    [project],
  );
  expect(p.rows[0].revision).toBe(3);
  expect(p.rows[0].working_files).toEqual(files);
  expect((await db.query("select * from versions")).rows).toHaveLength(3);
});

it("completes a conversational run without a version and releases its lock", async () => {
  const run = await db.query<{id:string}>("select id from start_run($1,gen_random_uuid(),3,'你好')", [project]);
  const result = await db.query<{data:{project:{revision:number;active_run_id:string|null};version:null;message:{content:string}}}>(
    "select commit_version($1,3,$2::jsonb,'你好！','ai',$3) as data", [project, JSON.stringify(files), run.rows[0].id]);
  expect(result.rows[0].data.version).toBeNull();
  expect(result.rows[0].data.project.revision).toBe(3);
  expect(result.rows[0].data.project.active_run_id).toBeNull();
  expect(result.rows[0].data.message.content).toBe('你好！');
  expect((await db.query("select * from versions")).rows).toHaveLength(3);
  expect((await db.query<{status:string}>("select status from runs where id=$1", [run.rows[0].id])).rows[0].status).toBe('completed');
  await expect(db.query("select commit_version($1,3,$2::jsonb,'duplicate','ai',$3)", [project, JSON.stringify(files), run.rows[0].id])).rejects.toThrow('RUN_EXPIRED');
});

it("rolls back rejected commits and keeps a newer run locked when old cleanup is repeated", async () => {
  const created = await db.query<{ id: string }>("select id from create_project('failure recovery',$1::jsonb)", [JSON.stringify(files)]);
  const pid = created.rows[0].id;
  const first = (await db.query<{ id: string }>("select id from start_run($1,gen_random_uuid(),0,'build')", [pid])).rows[0].id;
  await expect(db.query("select commit_version($1,0,'{}'::jsonb,'invalid','ai',$2)", [pid, first])).rejects.toThrow("INVALID_FILES");
  expect((await db.query("select * from versions where project_id=$1", [pid])).rows).toHaveLength(0);
  expect((await db.query<{working_files:unknown}>("select working_files from projects where id=$1", [pid])).rows[0].working_files).toEqual(files);
  await db.query("select fail_run($1,$2,'failed')", [pid, first]);
  const second = (await db.query<{id:string}>("select id from start_run($1,gen_random_uuid(),0,'retry')", [pid])).rows[0].id;
  await db.query("select fail_run($1,$2,'late duplicate cleanup')", [pid, first]);
  expect((await db.query<{active_run_id:string}>("select active_run_id from projects where id=$1", [pid])).rows[0].active_run_id).toBe(second);
  expect((await db.query("select * from messages where run_id=$1 and role='system'", [first])).rows).toHaveLength(1);
  await db.query("select fail_run($1,$2,'finished test')", [pid, second]);
});
