import { it, expect } from "vitest";
import { createCodingTools } from "@/lib/agent/coding-agent";
import { emptyFiles } from "@/lib/templates/react";
it("agent can inspect, patch, validate and recover without mutating the saved snapshot", async () => {
  const steps: string[] = [];
  const { tools, getFiles } = createCodingTools(emptyFiles, (s) =>
    steps.push(s),
  );
  const context = { toolCallId: "test", messages: [], context: {} };
  const before = await tools.read_files.execute!({ paths: [] }, context);
  expect(before).toEqual(emptyFiles);
  await tools.apply_changes.execute!(
    {
      updates: [
        {
          path: "/App.tsx",
          content: "export default function App(){return <div>Done</div>}",
        },
      ],
      deletes: [],
    },
    context,
  );
  expect(await tools.validate_project.execute!({}, context)).toEqual({
    valid: true,
    errors: [],
  });
  const last = { ...getFiles() };
  await tools.apply_changes.execute!(
    { updates: [{ path: "/package.json", content: "{}" }], deletes: [] },
    context,
  );
  expect(getFiles()).toEqual(last);
  expect(emptyFiles["/App.tsx"]).toContain("从一个想法开始");
  expect(steps.length).toBe(4);
});
