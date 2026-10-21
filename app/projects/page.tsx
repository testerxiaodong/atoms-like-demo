import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";
import { Home } from "@/components/home";
export default async function ProjectsPage() {
  if (!hasSupabase()) redirect("/");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/");
  const { data, error } = await db
    .from("projects")
    .select("id,name,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("无法加载项目，请确认数据库迁移已执行。");
  return <Home configured signedIn projects={data ?? []} />;
}
