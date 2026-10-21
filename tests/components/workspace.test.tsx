// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Workspace } from "@/components/workspace/workspace";
import type { AgentEvent, Project } from "@/lib/types";
vi.mock("next/dynamic", () => ({ default: () => () => <div>预览替身</div> }));
const project: Project = { id: "project", owner_id: "owner", name: "回归测试", working_files: { "/App.tsx": "export default function App(){return null}" }, template_version: "react-v1", revision: 0, head_version_id: null, active_run_id: null, created_at: "", updated_at: "" };
let fetchMock: ReturnType<typeof vi.fn>;
let stream: ReadableStreamDefaultController<Uint8Array>;
function emit(event: AgentEvent) { stream.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); }
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/chat")) return new Response(new ReadableStream({ start(controller) {
      stream = controller;
      init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
    } }));
    if (url.includes("/runs/")) return Response.json({ stopped: true });
    return Response.json({ project, messages: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() { render(<Workspace initialProject={project} modelReady />); return screen.getByRole("textbox", { name: "给构建助手发消息" }); }
it("sends Enter, immediately offers stop, shows progress before completion, and unlocks", async () => {
  const input = setup();
  fireEvent.change(input, { target: { value: "做秒表" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByRole("button", { name: "停止任务" }).classList.contains("stop-button")).toBe(true);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await act(async () => { emit({ type: "run", id: "run" }); emit({ type: "step", text: "正在编写计时组件" }); });
  expect(screen.getByText(/正在编写计时组件/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "发送消息" })).toBeNull();
  await act(async () => { emit({ type: "done", project, version: null, message: { id: "reply", project_id: project.id, run_id: "run", role: "assistant", content: "完成", steps: [], created_at: "" } }); stream.close(); });
  await waitFor(() => expect(screen.getByRole("button", { name: "发送消息" })).toBeTruthy());
  expect((input as HTMLTextAreaElement).disabled).toBe(false);
});
it("does not send Shift+Enter or Enter while the IME is composing", () => {
  const input = setup(); fireEvent.change(input, { target: { value: "你好" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("honors stop requested before the server has returned a run id", async () => {
  const input = setup(); fireEvent.change(input, { target: { value: "做秒表" } });
  fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
  fireEvent.click(screen.getByRole("button", { name: "停止任务" }));
  expect((screen.getByRole("button", { name: "正在停止" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { emit({ type: "run", id: "late-id" }); });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/projects/project/runs/late-id", expect.objectContaining({ method: "POST" })));
  await waitFor(() => expect(screen.getByRole("button", { name: "发送消息" })).toBeTruthy());
  expect((input as HTMLTextAreaElement).value).toBe("做秒表");
});
it("restores the draft and enables retry after a truncated response", async () => {
  const input = setup(); fireEvent.change(input, { target: { value: "原始需求" } });
  fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await act(async () => { emit({ type: "text", text: "生成了一半" }); stream.close(); });
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("连接已中断"));
  expect((input as HTMLTextAreaElement).value).toBe("原始需求");
  expect((screen.getByRole("button", { name: "发送消息" }) as HTMLButtonElement).disabled).toBe(false);
});
