import { z } from "zod";
import { validPath } from "@/lib/projects/files";
import type { FileMap } from "@/lib/types";

const fileEvent = z
  .object({
    type: z.literal("file"),
    path: z.string(),
    content: z.string(),
  })
  .strict();
const manifest = z
  .object({
    summary: z.string().min(1).max(4000),
    filePaths: z.array(z.string()).max(20),
  })
  .strict();

// Candidate source is held in memory. It is never written to disk or committed
// before the final manifest, source validation and application build succeed.
export function createFileOutput(
  initial: FileMap,
  onStep: (text: string) => void,
) {
  const staged: FileMap = {};
  const announced = new Map<string, string>();
  return {
    receive(text: string) {
      const value = JSON.parse(text);
      if (value?.type !== "file") return false;
      const file = fileEvent.parse(value);
      if (!validPath(file.path)) throw new Error("不允许的文件路径。");
      const next = { ...staged, [file.path]: file.content };
      if (
        Buffer.byteLength(file.content, "utf8") > 100_000 ||
        Buffer.byteLength(JSON.stringify(next), "utf8") > 300_000 ||
        Object.keys(next).length > 20
      )
        throw new Error("生成内容超过限制。");
      staged[file.path] = file.content;
      if (
        initial[file.path] !== file.content &&
        announced.get(file.path) !== file.content
      ) {
        onStep(
          `${Object.hasOwn(initial, file.path) ? "更新" : "新增"}源码：${file.path}`,
        );
        announced.set(file.path, file.content);
      }
      return true;
    },
    resolve(text: string) {
      const value = JSON.parse(text);
      if (!Object.hasOwn(value, "filePaths")) return text; // Older complete-file responses remain supported.
      const result = manifest.parse(value);
      if (new Set(result.filePaths).size !== result.filePaths.length)
        throw new Error("Codex 返回了重复文件路径。");
      if (Object.keys(staged).some((name) => !result.filePaths.includes(name)))
        throw new Error("文件清单与候选源码不一致。");
      const files = result.filePaths.map((name) => {
        if (
          !validPath(name) ||
          (!Object.hasOwn(staged, name) && !Object.hasOwn(initial, name))
        )
          throw new Error("文件清单引用了尚未收到的源码。");
        return {
          path: name,
          content: Object.hasOwn(staged, name) ? staged[name] : initial[name],
        };
      });
      return JSON.stringify({ summary: result.summary, files });
    },
    receivedCount() {
      return Object.keys(staged).length;
    },
    wasAnnounced(name: string, content: string) {
      return announced.get(name) === content;
    },
  };
}
