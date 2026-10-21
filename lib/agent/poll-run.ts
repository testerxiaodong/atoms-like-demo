import type { AgentEvent, Project, Version, Message } from "@/lib/types";
export async function pollRun(
  projectId: string,
  runId: string,
  signal: AbortSignal,
  onEvent: (event: AgentEvent) => void,
) {
  onEvent({ type: "run", id: runId });
  let seen = 0,
    failures = 0;
  while (true) {
    signal.throwIfAborted();
    let data: {
      run: { status: string; error?: string };
      steps?: string[];
      result?: { project: Project; version: Version | null; message: Message };
    };
    try {
      const response = await fetch(`/api/projects/${projectId}/runs/${runId}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("读取生成进度失败，请刷新项目查看结果。");
      data = await response.json();
      failures = 0;
    } catch (error) {
      signal.throwIfAborted();
      if (++failures >= 3) throw error;
      await pause(signal);
      continue;
    }
    for (const step of (data.steps ?? []).slice(seen))
      onEvent({ type: "step", text: step });
    seen = data.steps?.length ?? seen;
    if (data.run.status === "completed" && data.result) {
      onEvent({ type: "done", ...data.result });
      return;
    }
    if (data.run.status !== "running")
      throw new Error(data.run.error || "生成结果未能读取，请刷新项目。");
    await pause(signal);
  }
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 1500);
    signal.addEventListener("abort", abort, { once: true });
  });
}
