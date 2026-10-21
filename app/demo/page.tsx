import { Workspace } from "@/components/workspace/workspace";
import { getExample } from "@/lib/templates/examples";
import { demoFiles, TEMPLATE_VERSION } from "@/lib/templates/react";
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ example?: string }>;
}) {
  const example = getExample((await searchParams).example);
  return (
    <Workspace
      isDemo
      initialProject={{
        id: example?.id || "tasks",
        owner_id: example?.id || "tasks",
        name: example?.name || "小事清单",
        working_files: example?.files || demoFiles,
        template_version: TEMPLATE_VERSION,
        revision: 0,
        head_version_id: null,
        active_run_id: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      }}
    />
  );
}
