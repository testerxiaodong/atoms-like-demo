import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";
import { ApiError, databaseError, errorResponse } from "@/lib/projects/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const started = performance.now();
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError("项目不存在。", 404);
    if (!hasSupabase())
      throw new ApiError("请先配置 Supabase，连接登录与项目存储。", 503);
    const db = await createClient();
    // Read only the token here, never trust the cookie's user identity. Passing
    // it to getUser avoids holding the SDK session lock during the network call.
    const session = await db.auth.getSession();
    if (session.error || !session.data.session?.access_token)
      throw new ApiError("登录已过期，请重新登录。", 401);
    let authMs = 0;
    let databaseMs = 0;
    const timed = async <T>(
      operation: PromiseLike<T>,
      record: (ms: number) => void,
    ) => {
      const start = performance.now();
      const result = await operation;
      record(performance.now() - start);
      return result;
    };
    // Both reads use the caller's JWT and RLS. Check ownership before returning
    // any version data, without transferring the project's current source files.
    const [auth, [owner, versions]] = await Promise.all([
      timed(db.auth.getUser(session.data.session.access_token), (ms) => {
        authMs = ms;
      }),
      timed(
        Promise.all([
          db.from("projects").select("id,owner_id").eq("id", id).single(),
          db
            .from("versions")
            .select(
              "id,project_id,number,summary,source,restored_from_id,template_version,created_at",
            )
            .eq("project_id", id)
            .order("number", { ascending: false })
            .limit(100),
        ]),
        (ms) => {
          databaseMs = ms;
        },
      ),
    ]);
    if (auth.error || !auth.data.user)
      throw new ApiError("登录已过期，请重新登录。", 401);
    if (owner.error?.code === "PGRST116" || (!owner.error && !owner.data))
      throw new ApiError("项目不存在或无权访问。", 404);
    databaseError(owner.error);
    if (owner.data?.owner_id !== auth.data.user.id)
      throw new ApiError("项目不存在或无权访问。", 404);
    databaseError(versions.error);
    const finished = performance.now();
    return NextResponse.json(
      { versions: versions.data },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": `auth;dur=${authMs.toFixed(1)}, database;dur=${databaseMs.toFixed(1)}, app;dur=${(finished - started).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
