import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const mocks = vi.hoisted(() => ({ owned: vi.fn(), generate: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/projects/api", async (original) => ({ ...await original<object>(), ownedProject: mocks.owned }));
vi.mock("@/lib/env", () => ({ hasModel: () => true, isLocalCodex: () => true }));
vi.mock("@/lib/agent/local-codex", async (original) => ({ ...await original<object>(), runLocalCodex: mocks.generate }));
import { databaseError, errorResponse } from "@/lib/projects/api";
import { POST as chat } from "@/app/api/projects/[id]/chat/route";
import { GET as poll, POST as stop } from "@/app/api/projects/[id]/runs/[runId]/route";
import { activeRuns } from "@/lib/agent/active-runs";
const id = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const files = { "/App.tsx": "export default function App(){return null}" };
const project = { id, working_files: files, revision: 0, name: "test" };
const context = { params: Promise.resolve({ id, runId }) };
function request(prompt = "做一个工具") {
  return new Request(`http://localhost:3000/api/projects/${id}/chat`, { method: "POST", body: JSON.stringify({ prompt, revision: 0, requestKey: crypto.randomUUID() }) });
}
beforeEach(() => {
  vi.resetAllMocks(); activeRuns.clear();
  mocks.owned.mockResolvedValue({ project, db: { rpc: mocks.rpc, from: mocks.from } });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "start_run" ? { id: runId } : { project, version: null, message: { content: "完成" } }, error: null }));
  mocks.generate.mockResolvedValue({ files, summary: "完成" });
});
it.each([
  [{ code: "PGRST202", message: "function missing" }, 503, "迁移"],
  [{ code: "", message: "TypeError: fetch failed" }, 503, "连接"],
  [{ code: "23514", message: "constraint violation" }, 500, "数据操作未完成"],
  [{ code: "P0001", message: "REVISION_CONFLICT" }, 409, "新版本"],
  [{ code: "P0001", message: "RUN_EXPIRED" }, 409, "超时"],
])("classifies DB failures without calling every failure a missing migration: %j", async (error, status, text) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  try { databaseError(error); throw new Error("expected rejection"); }
  catch (failure) {
    const response = errorResponse(failure);
    expect(response.status).toBe(status);
    expect((await response.json()).error).toContain(text);
  }
  vi.restoreAllMocks();
});
it("answers greetings without invoking the model or creating a code change", async () => {
  const events = (await (await chat(request("你好"), context)).text()).trim().split("\n").map(line => JSON.parse(line));
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(events.at(-1).type).toBe("done");
  expect(mocks.rpc).toHaveBeenCalledWith("commit_version", expect.objectContaining({ p_files: files, p_summary: expect.stringContaining("小游戏") }));
  expect(activeRuns.size).toBe(0);
});
it("delivers progress while generation is still pending, then completes", async () => {
  let finish!: (value: { files: typeof files; summary: string }) => void;
  mocks.generate.mockImplementation(({ onStep }) => { onStep("正在实现计时组件"); return new Promise(resolve => { finish = resolve; }); });
  const response = await chat(request(), context);
  const reader = response.body!.getReader();
  let received = "";
  while (!received.includes("正在实现计时组件")) received += new TextDecoder().decode((await reader.read()).value);
  expect(received).not.toContain('"type":"done"');
  finish({ files, summary: "已完成" });
  while (true) { const chunk = await reader.read(); if (chunk.done) break; received += new TextDecoder().decode(chunk.value); }
  expect(received).toContain('"type":"done"');
  expect(activeRuns.size).toBe(0);
});
it("does not emit done when commit fails and retries transient lock cleanup", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let cleanupAttempts = 0;
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "start_run") return { data: { id: runId }, error: null };
    if (name === "commit_version") return { error: { message: "fetch failed" } };
    return { error: ++cleanupAttempts === 1 ? { message: "fetch failed" } : null };
  });
  const body = await (await chat(request(), context)).text();
  expect(body).toContain('"type":"error"');
  expect(body).not.toContain('"type":"done"');
  expect(body).not.toContain("迁移");
  expect(cleanupAttempts).toBe(2);
  expect(activeRuns.size).toBe(0);
  vi.restoreAllMocks();
});
it("rejects a bundle with a nonexistent named export before committing it", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.generate.mockResolvedValue({ files: { "/App.tsx": 'import {Missing} from "./lib/value";export default function App(){return <p>{Missing}</p>}', "/lib/value.ts": "export const value=1" }, summary: "完成" });
  const body = await (await chat(request(), context)).text();
  expect(body).toContain("编译未通过");
  expect(mocks.rpc.mock.calls.some(([name]) => name === "commit_version")).toBe(false);
  expect(mocks.rpc.mock.calls.some(([name]) => name === "fail_run")).toBe(true);
  vi.restoreAllMocks();
});
function mockRun(expires: string) {
  const chain = { eq: () => chain, single: async () => ({ data: { id: runId, status: "running", expires_at: expires }, error: null }) };
  mocks.from.mockReturnValue({ select: () => chain });
}
it("expires an orphaned run through the authenticated polling endpoint", async () => {
  mockRun(new Date(0).toISOString());
  const response = await poll(new Request("http://localhost:3000"), context);
  expect((await response.json()).run.status).toBe("failed");
  expect(mocks.rpc).toHaveBeenCalledWith("fail_run", expect.objectContaining({ p_run_id: runId }));
});
it("revokes commit permission before aborting the generation process", async () => {
  mockRun(new Date(Date.now() + 60000).toISOString());
  const abort = new AbortController(); activeRuns.set(runId, abort);
  mocks.rpc.mockImplementation(async () => { expect(abort.signal.aborted).toBe(false); return { error: null }; });
  expect((await stop(new Request("http://localhost:3000"), context)).status).toBe(200);
  expect(abort.signal.aborted).toBe(true);
});
