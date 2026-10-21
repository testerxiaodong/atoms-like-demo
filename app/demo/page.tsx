import { Workspace } from "@/components/workspace/workspace";
import { demoFiles, TEMPLATE_VERSION } from "@/lib/templates/react";
export default function Demo() {
  return (
    <Workspace
      isDemo
      initialProject={{
        id: "demo",
        owner_id: "demo",
        name: "小事清单",
        working_files: demoFiles,
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
