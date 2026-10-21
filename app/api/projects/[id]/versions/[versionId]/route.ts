import { NextResponse } from "next/server";
import { z } from "zod";
import { ownedProject, errorResponse, ApiError } from "@/lib/projects/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const { id, versionId } = await context.params;
    const { db, project } = await ownedProject(id);
    if (!z.uuid().safeParse(versionId).success)
      throw new ApiError("版本不存在。", 404);
    const { data, error } = await db
      .from("versions")
      .select("*")
      .eq("id", versionId)
      .eq("project_id", project.id)
      .single();
    if (error || !data) throw new ApiError("版本不存在。", 404);
    return NextResponse.json({ version: data });
  } catch (error) {
    return errorResponse(error);
  }
}
