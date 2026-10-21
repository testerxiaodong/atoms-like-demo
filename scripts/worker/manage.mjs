import { createServer, createConnection } from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, openSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const socket = ".demo/worker-control.sock";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function request(command) {
  return new Promise((resolve, reject) => {
    const client = createConnection(socket);
    let text = "";
    client.setTimeout(3000, () => client.destroy(new Error("Control timeout")));
    client.on("connect", () => client.end(command));
    client.on("data", (part) => (text += part));
    client.on("end", () => resolve(text));
    client.on("error", reject);
  });
}
export async function main(command = process.argv[2]) {
  mkdirSync(".demo", { recursive: true, mode: 0o700 });
  if (command === "_supervise") {
    let child,
      stopping = false;
    const server = createServer({ allowHalfOpen: true }, (client) => {
      let command = "";
      client.on("error", () => {});
      client.on("data", (part) => (command += part));
      client.on("end", () => {
        client.end(stopping ? "stopping" : "running");
        if (command === "stop") void stop();
      });
    });
    async function stop() {
      if (stopping) return;
      stopping = true;
      child?.kill("SIGTERM");
      setTimeout(() => {
        child?.kill("SIGKILL");
        server.close(() => process.exit(0));
      }, 5000).unref();
    }
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socket, resolve);
    });
    const fd = openSync(".demo/worker.log", "a", 0o600);
    child = spawn(process.execPath, ["scripts/worker/start.mjs"], {
      stdio: ["ignore", fd, fd],
    });
    child.on("error", () => void stop());
    child.on("exit", () => server.close(() => process.exit(0)));
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => void stop());
    return;
  }
  if (!["start", "stop", "status"].includes(command))
    throw new Error("Use start, stop or status");
  let state;
  try {
    state = await request("status");
  } catch (error) {
    if (!["ENOENT", "ECONNREFUSED"].includes(error.code)) throw error;
  }
  if (command === "status") {
    console.log(`Codex worker: ${state || "stopped"}`);
    return;
  }
  if (command === "stop") {
    if (!state) {
      console.log("Worker already stopped");
      return;
    }
    await request("stop");
    for (let i = 0; i < 30; i++) {
      await delay(250);
      try {
        await request("status");
      } catch {
        console.log("Codex worker stopped; cloud browsing remains available");
        return;
      }
    }
    throw new Error("Worker stop timed out");
  }
  if (state) {
    console.log(`Worker already ${state}`);
    return;
  }
  if (!existsSync(".env.worker"))
    throw new Error("Configure .env.worker first");
  if (existsSync(socket)) unlinkSync(socket);
  const fd = openSync(".demo/worker-manager.log", "a", 0o600);
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "_supervise"],
    { detached: true, stdio: ["ignore", fd, fd] },
  );
  child.unref();
  for (let i = 0; i < 20; i++) {
    await delay(500);
    try {
      if (await request("status")) {
        console.log(
          "Codex worker running in background; logs: .demo/worker.log",
        );
        return;
      }
    } catch {}
  }
  throw new Error("Worker startup failed; inspect .demo/worker.log");
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
