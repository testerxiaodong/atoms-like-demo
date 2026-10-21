import { it, expect } from "vitest";
import {
  classifyCodexMessage,
  isLoopbackRequest,
  parseCodexOutput,
  runLocalCodex,
} from "@/lib/agent/local-codex";
it("accepts localhost only and rejects cross-origin browser requests", () => {
  expect(
    isLoopbackRequest(
      new Request("http://localhost:3000/api", {
        headers: { origin: "http://localhost:3000" },
      }),
    ),
  ).toBe(true);
  expect(isLoopbackRequest(new Request("https://forma.example/api"))).toBe(
    false,
  );
  expect(
    isLoopbackRequest(
      new Request("http://localhost:3000/api", {
        headers: { origin: "https://other.example" },
      }),
    ),
  ).toBe(false);
});
it("rejects malformed or duplicate Codex file output", () => {
  const file = {
    path: "/App.tsx",
    content: "export default function App(){return null}",
  };
  expect(() =>
    parseCodexOutput(JSON.stringify({ summary: "ok", files: [file, file] })),
  ).toThrow("重复");
  expect(() =>
    parseCodexOutput(
      JSON.stringify({
        summary: "ok",
        files: [{ ...file, content: "export default <" }],
      }),
    ),
  ).toThrow("检查");
  expect(
    parseCodexOutput(JSON.stringify({ summary: "ok", files: [file] })).files[
      "/App.tsx"
    ],
  ).toContain("return null");
});
it.runIf(process.env.FORMA_CODEX_SMOKE === "1")(
  "runs a real minimal generation using the existing ChatGPT login",
  async () => {
    const result = await runLocalCodex({
      files: {
        "/App.tsx": "export default function App(){return <h1>Hello</h1>}",
      },
      prompt: "只将标题 Hello 改为 Forma ready，不添加功能。",
      signal: AbortSignal.timeout(85000),
      onStep: () => {},
    });
    expect(result.files["/App.tsx"]).toContain("Forma ready");
  },
  90000,
);

it("separates public progress from result payloads without leaking code", () => {
  expect(
    classifyCodexMessage("我会先实现键盘操作，再补充计分面板。").kind,
  ).toBe("progress");
  expect(classifyCodexMessage('{"summary":"完成","files":[]}').kind).toBe(
    "result",
  );
  expect(
    classifyCodexMessage("```tsx\nexport default function App(){}\n```").kind,
  ).toBe("ignore");
  expect(classifyCodexMessage(undefined).kind).toBe("ignore");
});
it.runIf(process.env.FORMA_CODEX_PROGRESS_SMOKE === "1")(
  "streams public progress before delivering a modular working application",
  async () => {
    const steps: string[] = [];
    const result = await runLocalCodex({
      files: { "/App.tsx": "export default function App(){return null}" },
      prompt:
        "做一个带开始暂停、重置和圈次列表的秒表。按组件、hook拆分4个左右文件。实现前和实现中请发送简短中文进展消息。",
      signal: AbortSignal.timeout(280000),
      onStep: (step) => {
        steps.push(step);
        console.log("Progress:", step);
      },
    });
    expect(Object.keys(result.files).length).toBeGreaterThanOrEqual(4);
    expect(result.streamedFileCount).toBeGreaterThanOrEqual(4);
    const firstFile = steps.findIndex((step) => /^(新增|更新)源码/.test(step));
    expect(firstFile).toBeGreaterThan(1);
    expect(
      steps.slice(1, firstFile).some((step) => !step.includes("自动重连")),
    ).toBe(true);
    const { buildPreview } = await import("@/lib/projects/preview");
    expect(await buildPreview(result.files)).toContain('id="root"');
  },
  290000,
);
