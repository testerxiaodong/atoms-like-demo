import { describe, it, expect } from "vitest";
import { applyChanges, validateFiles, validPath } from "@/lib/projects/files";
import { demoFiles, emptyFiles } from "@/lib/templates/react";
describe("generated file boundaries", () => {
  it("accepts both shipped templates", () => {
    expect(validateFiles(demoFiles)).toEqual([]);
    expect(validateFiles(emptyFiles)).toEqual([]);
  });
  it.each([
    "/../App.tsx",
    "/package.json",
    "/index.tsx",
    "/a/../../App.tsx",
    "/x.js",
  ])("rejects protected or unsupported path %s", (p) =>
    expect(validPath(p)).toBe(false),
  );
  it("does not partially apply a failed patch", () => {
    const original = { ...emptyFiles };
    expect(() =>
      applyChanges(original, {
        updates: [
          { path: "/styles.css", content: "" },
          { path: "/../bad.ts", content: "bad" },
        ],
        deletes: [],
      }),
    ).toThrow();
    expect(original).toEqual(emptyFiles);
  });
  it("rejects missing imports and unapproved packages", () => {
    expect(
      validateFiles({
        "/App.tsx":
          'import x from "./missing"; import y from "axios"; export default function App(){return <p/>}',
      }).join(),
    ).toMatch(/missing/);
    expect(
      validateFiles({
        "/App.tsx": 'import x from "axios"; export default x;',
      }).join(),
    ).toMatch(/axios/);
  });
  it("rejects malformed TSX", () =>
    expect(
      validateFiles({
        "/App.tsx": "export default function App(){ return <div>",
      }).length,
    ).toBeGreaterThan(0));
  it("requires a default export and entry file", () => {
    expect(
      validateFiles({ "/App.tsx": "export const x=1" }).length,
    ).toBeGreaterThan(0);
    expect(() =>
      applyChanges(emptyFiles, { updates: [], deletes: ["/App.tsx"] }),
    ).toThrow();
  });
});
