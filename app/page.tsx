import { Home } from "@/components/home";
import { hasSupabase } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export default async function Page({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authError = (await searchParams).error === "auth";
  if (hasSupabase()) {
    const db = await createClient();
    const { data } = await db.auth.getUser();
    if (data.user) redirect("/projects");
  }
  return <Home configured={hasSupabase()} authError={authError} />;
}
