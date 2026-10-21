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
it('ignores keepalive lines without reporting fake progress',async()=>{const events:AgentEvent[]=[];await readAgentStream(new Response('\n\n{"type":"error","message":"finished"}\n\n'),e=>events.push(e));expect(events).toEqual([{type:'error',message:'finished'}]);});
it('translates browser network errors into actionable feedback',async()=>{await expect(readAgentStream(new Response(new ReadableStream({start(c){c.error(new TypeError('network error'))}})),()=>{})).rejects.toThrow('生成连接已中断');});
