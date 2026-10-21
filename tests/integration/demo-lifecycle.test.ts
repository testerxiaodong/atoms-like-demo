import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import path from "node:path";
const exec = promisify(execFile);
let root: string;
let env: NodeJS.ProcessEnv;
const run = (command: string) =>
  exec(
    process.execPath,
    [path.join(root, "scripts/demo/manage.mjs"), command],
    { env, timeout: 15000 },
  );
afterEach(async () => {
  if (root) {
    await run("stop").catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
async function setup(fail = false) {
  root = await mkdtemp("/tmp/forma-test-");
  const port = await new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, "localhost", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });
  for (const dir of ["scripts/demo", ".cloudflared", ".next", "bin"])
    await mkdir(path.join(root, dir), { recursive: true });
  await copyFile(
    "scripts/demo/manage.mjs",
    path.join(root, "scripts/demo/manage.mjs"),
  );
  for (const file of [
    ".env.local",
    ".env.demo",
    ".next/BUILD_ID",
    ".cloudflared/forma-demo.token",
  ])
    await writeFile(path.join(root, file), "fixture");
  await writeFile(
    path.join(root, "scripts/demo/start.mjs"),
    `import {createServer} from 'node:http'; createServer((req,res)=>res.end('ok')).listen(Number(process.env.DEMO_PORT),'localhost');`,
  );
  await writeFile(
    path.join(root, "bin/cloudflared"),
    `#!${process.execPath}\n${fail ? "process.exit(1)" : "setInterval(()=>{},1000)"}\n`,
    { mode: 0o755 },
  );
  env = {
    ...process.env,
    HOME: root,
    DEMO_PORT: String(port),
    PATH: `${root}/bin:${process.env.PATH}`,
  };
  return port;
}
test("background demo starts once, stops both services and can restart", async () => {
  const port = await setup();
  expect((await run("start")).stdout).toContain("running in background");
  expect((await run("start")).stdout).toContain("already running");
  expect((await run("status")).stdout).toContain("running");
  expect((await fetch(`http://localhost:${port}`)).ok).toBe(true);
  await run("stop");
  await expect(fetch(`http://localhost:${port}`)).rejects.toThrow();
  expect((await run("status")).stdout).toContain("stopped");
  expect((await run("stop")).stdout).toContain("already stopped");
  expect((await run("start")).stdout).toContain("running in background");
}, 25000);
test("tunnel startup failure tears down the app", async () => {
  const port = await setup(true);
  await expect(run("start")).rejects.toThrow();
  await run("stop");
  await expect(fetch(`http://localhost:${port}`)).rejects.toThrow();
}, 20000);
