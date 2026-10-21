import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownedProject,
  databaseError,
  errorResponse,
  readBody,
  ApiError,
} from "@/lib/projects/api";
import { filesSchema, validateFiles } from "@/lib/projects/files";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, project } = await ownedProject((await context.params).id);
    const { files, revision } = z
      .object({ files: filesSchema, revision: z.number().int().nonnegative() })
      .parse(await readBody(request));
    const errors = validateFiles(files);
    if (errors.length) throw new ApiError(errors.join("\n"));
    const { data, error } = await db.rpc("commit_version", {
      p_project_id: project.id,
      p_revision: revision,
      p_files: files,
      p_summary: "保存了手动编辑的代码",
      p_source: "manual",
    });
    databaseError(error);
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
