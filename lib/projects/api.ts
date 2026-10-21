import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";
import type { Project } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function authenticated() {
  if (!hasSupabase())
    throw new ApiError("请先配置 Supabase，连接登录与项目存储。", 503);
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new ApiError("登录已过期，请重新登录。", 401);
  return { db, user };
}

export async function ownedProject(id: string) {
  if (!z.uuid().safeParse(id).success) throw new ApiError("项目不存在。", 404);
  const { db, user } = await authenticated();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (error || !data) throw new ApiError("项目不存在或无权访问。", 404);
  return { db, user, project: data as Project };
}

export async function readBody(request: Request) {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 400_000)
    throw new ApiError("请求内容过大。", 413);
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError("请求格式错误。");
  }
}

export function databaseError(
  error: { message: string; code?: string } | null,
) {
  if (!error) return;
  console.error("Database operation failed", {
    code: error.code,
    message: error.message,
  });
  const code = error.message;
  if (code.includes("REVISION_CONFLICT"))
    throw new ApiError(
      "项目已有新版本，请刷新后继续，当前修改未覆盖云端。",
      409,
    );
  if (code.includes("PROJECT_BUSY"))
    throw new ApiError("项目仍在生成中，请等待完成后再试。", 409);
  if (code.includes("DUPLICATE_REQUEST"))
    throw new ApiError("这条请求已提交，请刷新查看结果。", 409);
  if (code.includes("RUN_EXPIRED"))
    throw new ApiError("生成已超时或被取消，请重新尝试。", 409);
  if (code.includes("NOT_FOUND")) throw new ApiError("项目或版本不存在。", 404);
  if (code.includes("UNAUTHORIZED")) throw new ApiError("请重新登录。", 401);
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(error.code ?? ""))
    throw new ApiError("数据库缺少所需的表或函数，请检查数据库迁移。", 503);
  if (
    /fetch failed|network|timeout|timed out|connection|502|503|504/i.test(code)
  )
    throw new ApiError(
      "数据库连接暂时异常，请稍后重试；刷新可确认是否已保存。",
      503,
    );
  throw new ApiError("数据操作未完成，请刷新确认最新状态后重试。", 500);
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: "参数不正确，请检查输入后重试。" },
      { status: 400 },
    );
  return NextResponse.json(
    { error: "请求失败，请稍后重试。" },
    { status: 500 },
  );
}
