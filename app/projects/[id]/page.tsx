import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { createClient } from "@/lib/supabase/server";
import { hasSupabase, hasModel } from "@/lib/env";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasSupabase()) redirect("/");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/");
  const { id } = await params;
  const { data: project } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (!project) notFound();
  const { data: messages, error } = await db
    .from("messages")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("加载消息失败");
  return (
    <Workspace
      initialProject={project}
      initialMessages={(messages ?? []).reverse()}
      modelReady={hasModel()}
    />
  );
}
