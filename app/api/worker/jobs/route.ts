import { NextResponse } from "next/server";
import { workerDatabase } from "@/lib/agent/worker-auth";
import { databaseError, errorResponse } from "@/lib/projects/api";
export async function POST(request: Request) {
  try {
    const db = workerDatabase(request);
    const { data, error } = await db.rpc("claim_generation");
    databaseError(error);
    return NextResponse.json(
      { job: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
