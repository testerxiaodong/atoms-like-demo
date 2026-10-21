import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownedProject,
  databaseError,
  errorResponse,
  readBody,
  ApiError,
} from "@/lib/projects/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, project } = await ownedProject((await context.params).id);
    const { versionId, revision } = z
      .object({ versionId: z.uuid(), revision: z.number().int().nonnegative() })
      .parse(await readBody(request));
    const { data: version } = await db
      .from("versions")
      .select("id,number")
      .eq("id", versionId)
      .eq("project_id", project.id)
      .single();
    if (!version) throw new ApiError("版本不存在。", 404);
    const { data, error } = await db.rpc("commit_version", {
      p_project_id: project.id,
      p_revision: revision,
      p_files: {},
      p_summary: `从 V${version.number} 恢复了代码，后续修改以此版本为准。`,
      p_source: "restore",
      p_restored_from: version.id,
    });
    databaseError(error);
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
