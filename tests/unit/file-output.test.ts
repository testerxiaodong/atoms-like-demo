import { expect, it } from "vitest";
import { createFileOutput } from "@/lib/agent/file-output";
import { parseCodexOutput } from "@/lib/agent/local-codex";
const base = {
  "/App.tsx": "export default function App(){return null}",
  "/old.css": "body{}",
};
it("announces received candidates before final output, preserves originals and resolves a manifest", () => {
  const steps: string[] = [];
  const output = createFileOutput(base, (s) => steps.push(s));
  const content = "export const answer=42";
  expect(
    output.receive(
      JSON.stringify({ type: "file", path: "/lib/value.ts", content }),
    ),
  ).toBe(true);
  expect(steps).toEqual(["新增源码：/lib/value.ts"]);
  expect(base).not.toHaveProperty("/lib/value.ts");
  output.receive(
    JSON.stringify({ type: "file", path: "/lib/value.ts", content }),
  );
  expect(steps).toHaveLength(1);
  const final = output.resolve(
    JSON.stringify({
      summary: "完成",
      filePaths: ["/App.tsx", "/lib/value.ts"],
    }),
  );
  expect(parseCodexOutput(final).files).toEqual({
    "/App.tsx": base["/App.tsx"],
    "/lib/value.ts": content,
  });
});
it("rejects missing files, duplicate manifest entries and orphan candidates", () => {
  const output = createFileOutput(base, () => {});
  expect(() =>
    output.resolve(
      JSON.stringify({ summary: "x", filePaths: ["/missing.ts"] }),
    ),
  ).toThrow("尚未收到");
  expect(() =>
    output.resolve(
      JSON.stringify({ summary: "x", filePaths: ["/App.tsx", "/App.tsx"] }),
    ),
  ).toThrow("重复");
  output.receive(
    JSON.stringify({ type: "file", path: "/new.css", content: "body{}" }),
  );
  expect(() =>
    output.resolve(JSON.stringify({ summary: "x", filePaths: [] })),
  ).toThrow("不一致");
});
it("rejects unsafe paths and large candidate contents before reporting them", () => {
  const steps: string[] = [];
  const output = createFileOutput(base, (s) => steps.push(s));
  for (const path of ["/../secret.ts", "/package.json"])
    expect(() =>
      output.receive(JSON.stringify({ type: "file", path, content: "x" })),
    ).toThrow();
  expect(() =>
    output.receive(
      JSON.stringify({
        type: "file",
        path: "/large.css",
        content: "x".repeat(100001),
      }),
    ),
  ).toThrow("限制");
  expect(steps).toEqual([]);
});
it("keeps conversational and legacy results compatible", () => {
  const output = createFileOutput(base, () => {});
  expect(output.receive('{"summary":"你好","filePaths":[]}')).toBe(false);
  expect(
    parseCodexOutput(output.resolve('{"summary":"你好","filePaths":[]}')).files,
  ).toEqual({});
  const legacy = JSON.stringify({ summary: "hi", files: [] });
  expect(output.resolve(legacy)).toBe(legacy);
});
