import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { demoOrigin } from "@/lib/demo-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = demoOrigin() || process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const code = url.searchParams.get("code");
  if (code && !url.searchParams.has("error")) {
    try {
      const db = await createClient();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error)
        return NextResponse.redirect(
          new URL(
            url.searchParams.get("next") === "build"
              ? "/?resume=1"
              : "/projects",
            origin,
          ),
        );
    } catch {
      // Network failures should return to a retryable login screen too.
    }
  }
  return NextResponse.redirect(
    new URL(
      `/login?error=auth${url.searchParams.get("next") === "build" ? "&next=build" : ""}`,
      origin,
    ),
  );
}
