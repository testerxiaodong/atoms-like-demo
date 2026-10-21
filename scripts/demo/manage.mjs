import { spawn } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { mkdirSync, openSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const port = Number(process.env.DEMO_PORT || 3002);
const dir = path.join(root, ".demo");
const socket = path.join(dir, "control.sock");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function request(command) {
  return new Promise((resolve, reject) => {
    const client = createConnection(socket);
    let data = "";
    client.setTimeout(3000, () => client.destroy(new Error("Control timeout")));
    client.on("connect", () => client.end(command));
    client.on("data", (chunk) => {
      data += chunk;
    });
    client.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    client.on("error", reject);
  });
}
async function localReady() {
  try {
    return (
      await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(1500),
      })
    ).ok;
  } catch {
    return false;
  }
}
async function supervise() {
  const children = [];
  let state = "starting";
  let stopping = false;
  const server = createServer({ allowHalfOpen: true }, (client) => {
    let command = "";
    client.on("error", () => {});
    client.on("data", (chunk) => {
      command += chunk;
    });
    client.on("end", () => {
      client.end(JSON.stringify({ state }));
      if (command === "stop") void stop();
    });
  });
  async function stop() {
    if (stopping) return;
    stopping = true;
    state = "stopping";
    for (const child of children) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
    await delay(2000);
    for (const child of children) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
    server.close(() => process.exit(0));
  }
  // Bind before launching: simultaneous starts cannot create duplicate servers.
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, resolve);
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => void stop());
  function launch(command, args, name) {
    const fd = openSync(path.join(dir, `${name}.log`), "a", 0o600);
    const child = spawn(command, args, {
      cwd: root,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    children.push(child);
    child.on("error", (error) => {
      console.error(`${name}: ${error.message}`);
      void stop();
    });
    child.on("exit", () => {
      if (!stopping) {
        console.error(`${name} exited; stopping demo`);
        void stop();
      }
    });
  }
  const portFree = await new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "localhost", () => probe.close(() => resolve(true)));
  });
  if (!portFree) {
    console.error(`Port ${port} is occupied. Stop the existing server first.`);
    await stop();
    return;
  }
  launch(process.execPath, ["scripts/demo/start.mjs"], "app");
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !stopping) {
    if (await localReady()) {
      if (stopping) return;
      launch(
        "cloudflared",
        [
          "tunnel",
          "--protocol",
          "http2",
          "--no-autoupdate",
          "run",
          "--token-file",
          path.join(homedir(), ".cloudflared/forma-demo.token"),
        ],
        "tunnel",
      );
      await delay(2000);
      if (!stopping) state = "running";
      return;
    }
    await delay(500);
  }
  console.error("Application startup failed; see .demo/app.log");
  await stop();
}
async function main() {
  const command = process.argv[2];
  if (command === "_supervise") return supervise();
  if (!["start", "stop", "status"].includes(command))
    throw new Error("Use start, stop or status");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let current;
  let staleSocket = false;
  try {
    current = await request("status");
  } catch (e) {
    if (!["ENOENT", "ECONNREFUSED"].includes(e.code)) throw e;
    staleSocket = e.code === "ECONNREFUSED";
  }
  if (command === "status") {
    console.log(current ? `Demo: ${current.state}` : "Demo: stopped");
    return;
  }
  if (command === "stop") {
    if (!current) {
      console.log("Demo already stopped");
      return;
    }
    await request("stop");
    for (let i = 0; i < 40; i++) {
      await delay(250);
      try {
        await request("status");
      } catch {
        console.log("Application and tunnel stopped");
        return;
      }
    }
    throw new Error("Stop timed out; inspect .demo/manager.log");
  }
  if (current) {
    console.log(`Demo already ${current.state}`);
    return;
  }
  for (const file of [
    ".env.local",
    ".env.demo",
    ".next/BUILD_ID",
    path.join(homedir(), ".cloudflared/forma-demo.token"),
  ]) {
    if (!existsSync(file))
      throw new Error(
        `Missing ${file}. Configure the demo and run npm run build first.`,
      );
  }
  if (staleSocket && existsSync(socket)) unlinkSync(socket);
  const fd = openSync(path.join(dir, "manager.log"), "a", 0o600);
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "_supervise"],
    { cwd: root, detached: true, stdio: ["ignore", fd, fd] },
  );
  child.unref();
  for (let i = 0; i < 100; i++) {
    await delay(500);
    try {
      const result = await request("status");
      if (result.state === "running") {
        console.log(
          "Application and tunnel running in background. URL: https://forma.coder-cengdong.site\nLogs: .demo/app.log, .demo/tunnel.log",
        );
        return;
      }
      if (result.state === "stopping") break;
    } catch {}
  }
  throw new Error(
    "Startup failed; inspect .demo/manager.log and .demo/app.log",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
