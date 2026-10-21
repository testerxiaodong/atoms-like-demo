import { NextResponse } from "next/server";
import { ownedProject, databaseError, errorResponse } from "@/lib/projects/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, project } = await ownedProject((await context.params).id);
    const { data, error } = await db
      .from("versions")
      .select(
        "id,project_id,number,summary,source,restored_from_id,template_version,created_at",
      )
      .eq("project_id", project.id)
      .order("number", { ascending: false })
      .limit(100);
    databaseError(error);
    return NextResponse.json({ versions: data });
  } catch (error) {
    return errorResponse(error);
  }
}
