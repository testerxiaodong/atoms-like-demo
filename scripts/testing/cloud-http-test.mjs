import { createClient } from "@supabase/supabase-js";
import { parse } from "dotenv";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const publicMode = process.argv.includes("--public-demo");
const extraArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--public-demo");
const local = parse(await readFile(".env.local"));
const secret = parse(await readFile(".env.cloud-test"));
process.env.CLOUD_TEST_PROXY ||= secret.CLOUD_TEST_PROXY || "";
await import("./cloud-network-diagnostics.mjs");
const url = local.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(
  new URL(url).hostname,
  secret.CLOUD_TEST_EXPECTED_HOST,
  "Unexpected cloud project",
);
assert(secret.SUPABASE_SERVICE_ROLE_KEY, "Missing admin credential");
const admin = createClient(url, secret.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicOrigin = publicMode
  ? parse(await readFile(".env.demo")).DEMO_ORIGIN
  : "";
if (publicMode) {
  assert(
    publicOrigin && new URL(publicOrigin).protocol === "https:",
    "A configured HTTPS DEMO_ORIGIN is required",
  );
  assert.equal(new URL(publicOrigin).origin, publicOrigin.replace(/\/$/, ""));
}
const runId = randomUUID();
const users = [];
const tables = ["projects", "versions", "messages", "runs"];
await mkdir("cloud-test-results", { recursive: true });
const manifestPath = `cloud-test-results/cloud-${runId}.json`;
const manifest = {
  runId,
  url,
  users,
  projectIds: [],
  status: "preparing",
  mode: publicMode ? "public-demo" : "cloud-http",
  publicOrigin,
};
const journal = () =>
  writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
async function rows(table) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...data);
    if (data.length < 1000) return all;
  }
}
const digest = (data) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
const before = {};
for (const table of tables) before[table] = await rows(table);
manifest.beforeCounts = Object.fromEntries(
  tables.map((t) => [t, before[t].length]),
);
manifest.beforeHashes = Object.fromEntries(
  tables.map((t) => [t, digest(before[t])]),
);
await journal();
let child,
  interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = true;
    if (child?.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  });
try {
  const password = randomBytes(32).toString("base64url");
  for (const role of ["owner", "other"]) {
    if (interrupted) throw new Error("Interrupted");
    const email = `forma-http-${runId}-${role}@example.test`;
    const user = { id: randomUUID(), email };
    users.push(user);
    await journal();
    const { data, error } = await admin.auth.admin.createUser({
      id: user.id,
      email,
      password,
      email_confirm: true,
      app_metadata: { forma_http_run: runId },
    });
    if (error) throw error;
    assert.equal(data.user.id, user.id, "Created user ID differs from journal");
  }
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${process.cwd()}/scripts/testing/cloud-network-diagnostics.mjs`,
    PUBLIC_TEST_ORIGIN: publicOrigin,
    CLOUD_TEST_URL: url,
    CLOUD_TEST_KEY: local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    CLOUD_TEST_EMAIL: users[0].email,
    CLOUD_TEST_OTHER_EMAIL: users[1].email,
    CLOUD_TEST_PASSWORD: password,
  };
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  manifest.status = "running";
  await journal();
  console.log(
    publicMode
      ? "Public demo regression: isolated accounts, fixed HTTPS domain, real model and database."
      : "Cloud HTTP tests: two isolated users created; real Auth/PostgREST/PostgreSQL, deterministic model.",
  );
  const code = await new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        publicMode ? "tests/public" : "tests/http",
        publicMode
          ? "--config=playwright.public.config.ts"
          : "--config=playwright.cloud.config.ts",
        ...extraArgs,
      ],
      { env, stdio: "inherit", detached: true },
    );
    child.on("error", reject);
    child.on("exit", resolve);
  });
  assert.equal(code, 0, "Cloud HTTP tests failed");
  assert.equal(interrupted, false, "Interrupted");
  manifest.status = "passed";
} catch (error) {
  manifest.status = "failed";
  throw error;
} finally {
  // Exact IDs and run metadata guard every deletion. Never delete by name/prefix.
  const ids = users.map((u) => u.id);
  const projects = (await rows("projects")).filter((p) =>
    ids.includes(p.owner_id),
  );
  manifest.projectIds = projects.map((p) => p.id);
  await journal();
  for (const user of users) {
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error?.status === 404) continue;
    if (error) throw error;
    assert.equal(
      data.user.app_metadata.forma_http_run,
      runId,
      "Cleanup ownership mismatch",
    );
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) throw result.error;
  }
  for (const table of tables) {
    const after = await rows(table);
    assert.equal(
      after.filter((r) =>
        table === "projects"
          ? ids.includes(r.owner_id)
          : manifest.projectIds.includes(r.project_id),
      ).length,
      0,
      `Leftover test rows: ${table}`,
    );
    assert.equal(
      digest(after),
      digest(before[table]),
      `Existing ${table} changed during test window`,
    );
  }
  for (const user of users) {
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    assert.equal(error?.status, 404, "Account absence not confirmed");
    assert.equal(data.user, null, "Test user remains");
  }
  manifest.cleanup =
    "verified: test accounts and all test rows removed; existing rows unchanged";
  await journal();
  console.log(
    "Cleanup verified: 2 test accounts and " +
      projects.length +
      " test projects removed; all four existing tables unchanged.",
  );
}
