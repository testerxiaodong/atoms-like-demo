import { NextResponse } from "next/server";
import { activeRuns } from "@/lib/agent/active-runs";
import { z } from "zod";
import { isRemoteCodex } from "@/lib/env";
import {
  ownedProject,
  databaseError,
  errorResponse,
  ApiError,
} from "@/lib/projects/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const { id, runId } = await context.params;
    const { db, project } = await ownedProject(id);
    if (!z.uuid().safeParse(runId).success)
      throw new ApiError("执行记录不存在。", 404);
    const { data: run, error } = await db
      .from("runs")
      .select("id,status")
      .eq("project_id", project.id)
      .eq("id", runId)
      .single();
    if (error || !run) throw new ApiError("执行记录不存在。", 404);
    if (run.status === "running") {
      // Revoke the database commit permission before interrupting computation.
      const { error: stopError } = await db.rpc("fail_run", {
        p_project_id: project.id,
        p_run_id: runId,
        p_error: "已停止任务，原版本已保留。",
      });
      databaseError(stopError);
      activeRuns.get(runId)?.abort();
    }
    return NextResponse.json({ stopped: run.status === "running" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const { id, runId } = await context.params;
    const { db, project } = await ownedProject(id);
    if (!z.uuid().safeParse(runId).success)
      throw new ApiError("执行记录不存在。", 404);
    const { data, error } = await db
      .from("runs")
      .select("id,status,error,expires_at,finished_at")
      .eq("id", runId)
      .eq("project_id", project.id)
      .single();
    if (error || !data) throw new ApiError("执行记录不存在。", 404);
    if (data.status === "running" && Date.parse(data.expires_at) < Date.now()) {
      const { error: failError } = await db.rpc("fail_run", {
        p_project_id: id,
        p_run_id: runId,
        p_error: "上次生成已中断或超时，可以重新尝试。",
      });
      databaseError(failError);
      return NextResponse.json({
        run: { ...data, status: "failed", error: "上次生成已中断或超时。" },
      });
    }
    if (isRemoteCodex()) {
      const { data: job, error: jobError } = await db
        .from("generation_jobs")
        .select("steps,result")
        .eq("run_id", runId)
        .eq("project_id", id)
        .maybeSingle();
      databaseError(jobError);
      return NextResponse.json(
        { run: data, steps: job?.steps ?? [], result: job?.result ?? null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json({ run: data });
  } catch (error) {
    return errorResponse(error);
  }
}
