import { createClient } from "@supabase/supabase-js";
import { parse } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const path = process.argv[2];
assert(
  /^cloud-test-results\/cloud-[0-9a-f-]{36}\.json$/.test(path || ""),
  "Provide exact run manifest",
);
const manifest = JSON.parse(await readFile(path, "utf8"));
const local = parse(await readFile(".env.local")),
  secret = parse(await readFile(".env.cloud-test"));
process.env.CLOUD_TEST_PROXY ||= secret.CLOUD_TEST_PROXY || "";
await import("./cloud-network-diagnostics.mjs");
assert.equal(manifest.url, local.NEXT_PUBLIC_SUPABASE_URL);
const db = createClient(manifest.url, secret.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function readRetry(fn) {
  for (let n = 0; ; n++) {
    const r = await fn();
    if (!r.error || r.error.status === 404) return r;
    if (n === 4) throw r.error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const tables = ["projects", "versions", "messages", "runs"];
async function rows(table) {
  const result = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await readRetry(() =>
      db
        .from(table)
        .select("*")
        .order("id")
        .range(i, i + 999),
    );
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
const ids = manifest.users.map((u) => u.id);
const projects = (await rows("projects")).filter((p) =>
  ids.includes(p.owner_id),
);
manifest.projectIds = [
  ...new Set([...manifest.projectIds, ...projects.map((p) => p.id)]),
];
await writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
const own = (t, r) =>
  t === "projects"
    ? ids.includes(r.owner_id)
    : manifest.projectIds.includes(r.project_id);
const hash = (data) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
const before = {};
for (const t of tables)
  before[t] = hash((await rows(t)).filter((r) => !own(t, r)));
for (const user of manifest.users) {
  const { data, error } = await readRetry(() =>
    db.auth.admin.getUserById(user.id),
  );
  if (error) {
    assert.equal(error.status, 404);
    continue;
  }
  assert.equal(
    data.user.app_metadata.forma_http_run,
    manifest.runId,
    "Cleanup marker mismatch",
  );
  const result = await db.auth.admin.deleteUser(user.id);
  if (result.error) throw result.error;
}
for (const t of tables) {
  const data = await rows(t);
  assert.equal(data.filter((r) => own(t, r)).length, 0);
  assert.equal(hash(data), before[t]);
  if (manifest.beforeHashes) assert.equal(hash(data), manifest.beforeHashes[t]);
}
for (const user of manifest.users) {
  const { data, error } = await readRetry(() =>
    db.auth.admin.getUserById(user.id),
  );
  assert.equal(error?.status, 404);
  assert.equal(data.user, null);
}
manifest.cleanup =
  "verified: all run accounts and associated rows absent; existing rows unchanged during cleanup";
manifest.cleanupVerifiedAt = new Date().toISOString();
await writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
console.log(
  `Cleanup verified for ${manifest.runId}: ${ids.length} accounts, ${manifest.projectIds.length} projects; zero leftovers.`,
);
