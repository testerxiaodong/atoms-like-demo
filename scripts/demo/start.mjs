import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

loadEnvFile(".env.local");
loadEnvFile(".env.demo");
if (
  process.env.FORMA_DEMO !== "1" ||
  !/^https:\/\/[^/]+\/?$/.test(process.env.DEMO_ORIGIN || "")
) {
  throw new Error(
    "Configure FORMA_DEMO, and HTTPS DEMO_ORIGIN in .env.demo first.",
  );
}
// Administrative database credentials are never passed to the application.
const env = {
  ...process.env,
  NODE_ENV: "production",
  AGENT_BACKEND: "codex-local",
};
delete env.SUPABASE_SERVICE_ROLE_KEY;
const child = spawn(
  process.execPath,
  [
    "--import",
    fileURLToPath(new URL("./network.mjs", import.meta.url)),
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "localhost",
    "--port",
    "3002",
  ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
