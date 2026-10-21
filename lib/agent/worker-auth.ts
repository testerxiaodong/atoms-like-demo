import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/projects/api";

export function workerDatabase(request: Request) {
  const expected = process.env.CODEX_WORKER_SECRET || "";
  const actual =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (
    expected.length < 32 ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    throw new ApiError("Unauthorized", 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError("Worker unavailable", 503);
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
