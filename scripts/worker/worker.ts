import { runLocalCodex } from "../../lib/agent/local-codex";
import { conversationalReply } from "../../lib/agent/conversation";
import type { FileMap } from "../../lib/types";
const origin = process.env.WORKER_APP_ORIGIN;
const secret = process.env.CODEX_WORKER_SECRET;
if (
  !origin ||
  new URL(origin).protocol !== "https:" ||
  !secret ||
  secret.length < 32
)
  throw new Error(
    "Configure HTTPS WORKER_APP_ORIGIN and CODEX_WORKER_SECRET in .env.worker",
  );
const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => shutdown.abort());
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    if (shutdown.signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      shutdown.signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    shutdown.signal.addEventListener("abort", done, { once: true });
  });
async function post(path: string, body = {}) {
  const res = await fetch(new URL(path, origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Worker request failed (${res.status})`);
  return res.json();
}
interface Job {
  runId: string;
  claimId: string;
  prompt: string;
  files: FileMap;
  expiresAt: string;
}
async function execute(job: Job) {
  const local = new AbortController();
  const budget = Math.min(
    600_000,
    Date.parse(job.expiresAt) - Date.now() - 30_000,
  );
  const timeout = AbortSignal.timeout(Math.max(1, budget));
  const signal = AbortSignal.any([local.signal, shutdown.signal, timeout]);
  const steps: string[] = [];
  let syncing = false,
    failures = 0;
  const update = (payload = {}) =>
    post(`/api/worker/jobs/${job.runId}`, {
      claimId: job.claimId,
      steps,
      ...payload,
    });
  const heartbeat = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const result = await update();
      failures = 0;
      if (result.status !== "running") local.abort();
    } catch {
      if (++failures >= 3) local.abort();
    } finally {
      syncing = false;
    }
  }, 2000);
  try {
    signal.throwIfAborted();
    const request = job.prompt.split("Current request:\n").at(-1) || "";
    const greeting = conversationalReply(request);
    const generated = greeting
      ? { files: job.files, summary: greeting }
      : await runLocalCodex({
          files: job.files,
          prompt: job.prompt,
          signal,
          onStep: (step) => {
            if (steps.length < 195) steps.push(step.slice(0, 2000));
          },
        });
    signal.throwIfAborted();
    clearInterval(heartbeat);
    steps.push("正在由云端编译并保存版本");
    const result = {
      files: Object.keys(generated.files).length ? generated.files : job.files,
      summary: generated.summary,
    };
    // Completion is idempotent at the database boundary; retry lost responses.
    for (let attempt = 0; ; attempt++) {
      try {
        await update(result);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await sleep(1000);
      }
    }
    console.log("Generation finished");
  } catch {
    const error = timeout.aborted
      ? "生成超过 600 秒上限，原版本已保留。"
      : signal.aborted
        ? "生成已停止或工作节点连接中断，原版本已保留。"
        : "生成或编译失败，原版本已保留，请重试。";
    await update({ error }).catch(() => {});
    console.log("Generation stopped or failed");
  } finally {
    clearInterval(heartbeat);
  }
}
console.log("Codex worker started; project data remains in the cloud");
while (!shutdown.signal.aborted) {
  try {
    const { job } = await post("/api/worker/jobs");
    if (job) await execute(job);
    else await sleep(3000);
  } catch {
    console.log("Cloud unavailable; reconnecting");
    await sleep(5000);
  }
}
