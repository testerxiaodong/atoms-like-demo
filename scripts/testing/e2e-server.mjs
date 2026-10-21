import { spawn } from "node:child_process";
import path from "node:path";
import { startBackend } from "../../tests/fixtures/e2e-backend.mjs";
const closeBackend = process.env.CLOUD_TEST_URL
  ? async () => {}
  : await startBackend();
const appEnv = { ...process.env };
delete appEnv.SUPABASE_SERVICE_ROLE_KEY;
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "localhost",
    "--port",
    "3001",
  ],
  {
    stdio: "inherit",
    env: {
      ...appEnv,
      FORMA_E2E: "1",
      AGENT_BACKEND: "codex-local",
      CODEX_CLI_PATH: path.resolve("tests/fixtures/e2e-codex.cjs"),
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.CLOUD_TEST_URL || "http://localhost:54329",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.CLOUD_TEST_KEY || "local-test-key",
      NEXT_PUBLIC_APP_URL: "http://localhost:3001",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await closeBackend();
  process.exit(code ?? 0);
});
