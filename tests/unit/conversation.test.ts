import { expect, it } from "vitest";
import { conversationalReply, sameFiles } from "@/lib/agent/conversation";
import { parseCodexOutput } from "@/lib/agent/local-codex";

it("answers a greeting immediately without swallowing mixed feature requests", () => {
  expect(conversationalReply("你好！")).toContain("你好");
  expect(conversationalReply("你好，帮我增加按钮")).toBeNull();
  expect(conversationalReply("解释一下这个项目")).toBeNull();
});
it("accepts conversational model output and ignores file ordering for changes", () => {
  expect(parseCodexOutput('{"summary":"你好！","files":[]}').files).toEqual({});
  expect(sameFiles({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
  expect(sameFiles({ a: "1" }, { a: "2" })).toBe(false);
});
