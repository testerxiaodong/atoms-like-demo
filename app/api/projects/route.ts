import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticated,
  databaseError,
  errorResponse,
  readBody,
} from "@/lib/projects/api";
import { getExample } from "@/lib/templates/examples";
import { emptyFiles } from "@/lib/templates/react";

export async function GET() {
  try {
    const { db } = await authenticated();
    const { data, error } = await db
      .from("projects")
      .select("id,name,revision,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    databaseError(error);
    return NextResponse.json({ projects: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const started = performance.now();
  try {
    const { db } = await authenticated();
    const authenticatedAt = performance.now();
    const { name, exampleId } = z
      .object({
        name: z.string().trim().min(1).max(80),
        exampleId: z
          .string()
          .refine((id) => !!getExample(id), "未知示例")
          .optional(),
      })
      .parse(await readBody(request));
    const databaseStarted = performance.now();
    const { data, error } = await db.rpc("create_project", {
      p_name: name,
      p_files: getExample(exampleId)?.files || emptyFiles,
    });
    databaseError(error);
    return NextResponse.json(
      { project: data },
      {
        status: 201,
        headers: {
          "Server-Timing": `auth;dur=${(authenticatedAt - started).toFixed(1)}, database;dur=${(performance.now() - databaseStarted).toFixed(1)}, app;dur=${(performance.now() - started).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
