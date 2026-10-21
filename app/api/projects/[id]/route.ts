import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownedProject,
  databaseError,
  errorResponse,
  readBody,
} from "@/lib/projects/api";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { db, project } = await ownedProject((await context.params).id);
    const { data: messages, error } = await db
      .from("messages")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(200);
    databaseError(error);
    return NextResponse.json({ project, messages: (messages ?? []).reverse() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { db, project } = await ownedProject((await context.params).id);
    const { name } = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await readBody(request));
    const { data, error } = await db.rpc("rename_project", {
      p_project_id: project.id,
      p_name: name,
    });
    databaseError(error);
    return NextResponse.json({ project: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { db, project } = await ownedProject((await context.params).id);
    const { error } = await db.rpc("delete_project", {
      p_project_id: project.id,
    });
    databaseError(error);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
