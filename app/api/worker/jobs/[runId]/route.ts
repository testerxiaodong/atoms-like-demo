import { NextResponse } from "next/server";
import { z } from "zod";
import { workerDatabase } from "@/lib/agent/worker-auth";
import {
  ApiError,
  databaseError,
  errorResponse,
  readBody,
} from "@/lib/projects/api";
import { validateFiles } from "@/lib/projects/files";
import { buildPreview } from "@/lib/projects/preview";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const db = workerDatabase(request);
    const runId = z.uuid().parse((await context.params).runId);
    const input = z
      .object({
        claimId: z.uuid(),
        steps: z.array(z.string().max(2000)).max(200),
        files: z.record(z.string(), z.string()).optional(),
        summary: z.string().min(1).max(4000).optional(),
        error: z.string().max(500).optional(),
      })
      .parse(await readBody(request));
    if (input.files) {
      if (!input.summary || input.error) throw new ApiError("Invalid result");
      const errors = validateFiles(input.files);
      if (errors.length) throw new ApiError("源码校验失败，原版本已保留。");
      // Short cloud build, never a long-running model call.
      await buildPreview(input.files);
    }
    const { data, error } = await db.rpc("update_generation", {
      p_run_id: runId,
      p_claim_id: input.claimId,
      p_steps: input.steps,
      p_files: input.files ?? null,
      p_summary: input.summary ?? null,
      p_error: input.error ?? null,
    });
    databaseError(error);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
