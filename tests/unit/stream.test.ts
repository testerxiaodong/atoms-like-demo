import { it, expect } from "vitest";
import { readAgentStream } from "@/lib/stream";
import type { AgentEvent } from "@/lib/types";
it("decodes split UTF-8 and a terminal event without trailing newline", async () => {
  const bytes = new TextEncoder().encode(
    '{"type":"text","text":"你好"}\n{"type":"error","message":"测试"}',
  );
  const response = new Response(
    new ReadableStream({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    }),
  );
  const events: AgentEvent[] = [];
  await readAgentStream(response, (e) => events.push(e));
  expect(events).toEqual([
    { type: "text", text: "你好" },
    { type: "error", message: "测试" },
  ]);
});
it("does not treat truncated generation as success", async () => {
  await expect(
    readAgentStream(new Response('{"type":"text","text":"half"}\n'), () => {}),
  ).rejects.toThrow("中断");
});
