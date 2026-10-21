import { demoEnabled } from "@/lib/demo-access";
import { NextResponse } from "next/server";
import { readBody, errorResponse, ApiError, authenticated } from "@/lib/projects/api";
import { filesSchema } from "@/lib/projects/files";
import { z } from "zod";
import { buildPreview } from "@/lib/projects/preview";

export const runtime = "nodejs";
// Like the interactive demo, compilation is available without signing in.
// Source is size-limited, imports are allowlisted, and never executed here.
export async function POST(request: Request) {
  try {
    if (demoEnabled()) await authenticated();
    const { files: parsed } = z.object({ files: filesSchema }).parse(await readBody(request));
    let html: string;
    try {
      html = await buildPreview(parsed);
    } catch (error) {
      throw new ApiError(`预览编译失败：${error instanceof Error ? error.message.slice(0, 500) : "请检查代码"}`);
    }
    return NextResponse.json({ html }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
