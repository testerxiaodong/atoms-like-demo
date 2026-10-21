import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runLocalCodex } from "@/lib/agent/local-codex";

it("keeps recoverable reconnects alive, streams public progress, and ignores reasoning", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "forma-stream-test-"));
  const executable = path.join(dir, "fake-codex");
  const file = "export default function App(){return <h1>Ready</h1>}";
  await writeFile(
    executable,
    `#!${process.execPath}
process.stdin.resume();
process.stdin.on('end', () => {
  const emit = event => process.stdout.write(JSON.stringify(event) + '\\n');
  emit({type:'error',message:'Reconnecting... 1/5 (connection interrupted)'});
  emit({type:'item.completed',item:{type:'reasoning',text:'PRIVATE_REASONING'}});
  emit({type:'item.completed',item:{type:'agent_message',text:'先实现计时，再补充操作面板。'}});
  setTimeout(() => {
    emit({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({summary:'完成',files:[{path:'/App.tsx',content:${JSON.stringify(file)}}]})}});
    emit({type:'turn.completed'});
  }, 80);
});
`,
    { mode: 0o700 },
  );
  vi.stubEnv("CODEX_CLI_PATH", executable);
  try {
    const steps: string[] = [];
    let finished = false;
    const result = await runLocalCodex({
      files: { "/App.tsx": "export default function App(){return null}" },
      prompt: "做一个秒表",
      signal: AbortSignal.timeout(5000),
      onStep: (step) => {
        expect(finished).toBe(false);
        steps.push(step);
      },
    });
    finished = true;
    expect(result.files["/App.tsx"]).toBe(file);
    expect(steps).toContain("模型连接暂时中断，正在自动重连");
    expect(steps).toContain("先实现计时，再补充操作面板。");
    expect(steps.join(" ")).not.toContain("PRIVATE_REASONING");
    expect(steps.indexOf("先实现计时，再补充操作面板。")).toBeLessThan(
      steps.indexOf("更新源码：/App.tsx"),
    );
  } finally {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  }
});

it("demo serializes model jobs and releases its slot after timeout", async () => {
  vi.stubEnv("FORMA_DEMO", "1");
  vi.stubEnv("CODEX_CLI_PATH", path.resolve("tests/fixtures/e2e-codex.cjs"));
  const controller = new AbortController();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const args = {
    files: { "/App.tsx": "export default function App(){return null}" },
    prompt: "E2E_SLOW",
    signal: controller.signal,
    onStep: () => ready(),
  };
  const first = runLocalCodex(args);
  const rejected = expect(first).rejects.toThrow();
  try {
    await started;
    await expect(runLocalCodex({ ...args, onStep: () => {} })).rejects.toThrow(
      "另一个任务",
    );
    controller.abort(new DOMException("Timed out", "TimeoutError"));
    await rejected;
    const next = await runLocalCodex({
      ...args,
      prompt: "生成计数器",
      signal: AbortSignal.timeout(10000),
      onStep: () => {},
    });
    expect(next.files["/App.tsx"]).toContain("Counter");
  } finally {
    controller.abort();
    await first.catch(() => {});
    vi.unstubAllEnvs();
  }
}, 15000);
