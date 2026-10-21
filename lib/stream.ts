import type { AgentEvent } from "@/lib/types";

export async function readAgentStream(
  response: Response,
  onEvent: (event: AgentEvent) => void,
) {
  if (!response.body) throw new Error("服务器未返回生成内容。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AgentEvent;
    if (event.type === "done" || event.type === "error") terminal = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consume);
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!terminal) throw new Error("连接已中断，请重新打开项目检查生成结果。");
  } finally {
    reader.releaseLock();
  }
}
