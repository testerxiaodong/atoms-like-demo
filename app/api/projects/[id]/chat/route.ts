import { startHeartbeat } from "@/lib/agent/heartbeat";
import { conversationalReply, sameFiles } from "@/lib/agent/conversation";
import { activeRuns } from "@/lib/agent/active-runs";
import {
  CodexFailure,
  isLoopbackRequest,
  runLocalCodex,
} from "@/lib/agent/local-codex";
import { z } from "zod";
import { hasModel, isLocalCodex } from "@/lib/env";
import {
  ApiError,
  ownedProject,
  databaseError,
  errorResponse,
  readBody,
} from "@/lib/projects/api";
import { createCodingAgent } from "@/lib/agent/coding-agent";
import { buildPreview } from "@/lib/projects/preview";
import { validateFiles } from "@/lib/projects/files";
import type { AgentEvent, Message } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 660;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, project } = await ownedProject((await context.params).id);
    if (!hasModel())
      throw new ApiError(
        "模型尚未连接，请配置 AI_BASE_URL、AI_API_KEY 和 AI_MODEL。",
        503,
      );
    if (isLocalCodex() && !isLoopbackRequest(request))
      throw new ApiError("订阅模式仅供本机访问。", 403);
    const input = z
      .object({
        prompt: z.string().trim().min(1).max(4000),
        revision: z.number().int().nonnegative(),
        requestKey: z.uuid(),
      })
      .parse(await readBody(request));
    const { data: history, error: historyError } = await db
      .from("messages")
      .select("role,content")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(12);
    databaseError(historyError);
    const { data: run, error: startError } = await db.rpc("start_run", {
      p_project_id: project.id,
      p_request_key: input.requestKey,
      p_revision: input.revision,
      p_prompt: input.prompt,
    });
    databaseError(startError);
    const startedAt = Date.now();
    const abort = new AbortController();
    activeRuns.set(run.id, abort);
    const timeoutMs = isLocalCodex() ? 600_000 : 100_000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = AbortSignal.any([
      abort.signal,
      request.signal,
      timeoutSignal,
    ]);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let disconnected = false;
        function emit(event: AgentEvent) {
          if (disconnected) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          } catch {
            disconnected = true;
            abort.abort();
          }
        }
        const stopHeartbeat = startHeartbeat(
          () => {
            if (!disconnected) controller.enqueue(encoder.encode("\n"));
          },
          () => {
            disconnected = true;
            abort.abort();
          },
        );
        const steps: string[] = [];
        const onStep = (text: string) => {
          steps.push(text);
          emit({ type: "step", text });
        };
        emit({ type: "run", id: run.id });
        try {
          signal.throwIfAborted();
          const prompt = [
            `Current project: ${project.name}; revision: ${project.revision}.`,
            `Files: ${JSON.stringify(Object.keys(project.working_files))}`,
            `Recent conversation (current files take precedence):\n${(
              (history as Pick<Message, "role" | "content">[]) ?? []
            )
              .reverse()
              .map((m) => `${m.role}: ${m.content.slice(0, 1800)}`)
              .join("\n")}`,
            `Current request:\n${input.prompt}`,
          ].join("\n\n");
          onStep("正在处理消息");
          let text = "";
          let files = project.working_files;
          const reply = conversationalReply(input.prompt);
          if (reply) {
            text = reply;
            emit({ type: "text", text });
          } else if (isLocalCodex()) {
            const generated = await runLocalCodex({
              files,
              prompt,
              signal,
              onStep,
            });
            if (Object.keys(generated.files).length) files = generated.files;
            text = generated.summary;
            emit({ type: "text", text });
          } else {
            const { agent, getFiles } = createCodingAgent(
              project.working_files,
              onStep,
            );
            const result = await agent.stream({ prompt, abortSignal: signal });
            for await (const part of result.fullStream) {
              if (part.type === "text-delta") {
                text += part.text;
                emit({ type: "text", text: part.text });
              } else if (part.type === "error") {
                throw new ApiError(
                  "模型调用失败，请检查模型配置或稍后重试。",
                  502,
                );
              } else if (part.type === "abort") {
                throw new ApiError("生成已停止或超时，原版本已保留。", 408);
              } else if (part.type === "tool-error") {
                onStep("工具执行遇到问题，Agent 正在处理");
              }
            }
            signal.throwIfAborted();
            if ((await result.finishReason) === "length")
              throw new ApiError("本次生成超出长度限制，请缩小需求后重试。");
            files = getFiles();
          }
          const errors = validateFiles(files);
          if (errors.length)
            throw new ApiError(
              `源码检查未通过，原版本已保留：${errors.slice(0, 3).join("；")}`,
            );
          const changed = !sameFiles(files, project.working_files);
          if (changed) {
            onStep("正在编译应用，检查组件引用与打包结果");
            try {
              await buildPreview(files);
            } catch {
              throw new ApiError(
                "应用编译未通过，原版本已保留。请重试或缩小修改范围。",
              );
            }
            signal.throwIfAborted();
            onStep("应用编译通过；交互效果请在右侧预览中体验");
          }
          onStep(changed ? "正在保存新版本" : "正在保存回复");
          const { data, error } = await db.rpc("commit_version", {
            p_project_id: project.id,
            p_revision: input.revision,
            p_files: files,
            p_summary:
              text.trim().slice(-4000) ||
              (changed
                ? "应用代码已更新，请在预览中检查交互效果。"
                : "本轮没有修改应用。你可以继续提问或描述想调整的功能。"),
            p_source: "ai",
            p_run_id: run.id,
            p_steps: steps,
          });
          databaseError(error);
          emit({ type: "done", ...data });
        } catch (error) {
          console.error("Agent turn failed:", {
            at: new Date().toISOString(),
            runId: run.id,
            elapsedMs: Date.now() - startedAt,
            reason: timeoutSignal.aborted
              ? "timeout"
              : request.signal.aborted
                ? "client-disconnected"
                : abort.signal.aborted
                  ? "stopped-or-stream-cancelled"
                  : "agent-or-storage",
            message: error instanceof Error ? error.message : "Unknown error",
          });
          const message = timeoutSignal.aborted
            ? `生成超过 ${timeoutMs / 1000} 秒上限，已停止，原版本已保留。请缩小需求后重试。`
            : signal.aborted
              ? "任务已停止或连接已断开，原版本已保留。"
              : error instanceof ApiError || error instanceof CodexFailure
                ? error.message
                : "生成未完成，请稍后重试。原版本已保留。";
          // A transient database/auth request failure must not strand the lock.
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const { error: failError } = await db.rpc("fail_run", {
                p_project_id: project.id,
                p_run_id: run.id,
                p_error: message,
              });
              if (!failError) break;
            } catch {
              // Expiry remains the final fallback if the database is unreachable.
            }
          }
          emit({ type: "error", message });
        } finally {
          stopHeartbeat();
          activeRuns.delete(run.id);
          if (!disconnected) {
            try {
              controller.close();
            } catch {
              /* Stream already cancelled. */
            }
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
