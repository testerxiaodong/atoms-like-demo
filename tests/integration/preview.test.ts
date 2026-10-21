import { Script } from "node:vm";
import { it, expect } from 'vitest';
import { buildPreview } from '@/lib/projects/preview';
it('bundles a project and CSS without executing generated code on the server', async () => {
  const html = await buildPreview({'/App.tsx':'import React from "react";import "./styles.css"; export default function App(){return <h1>Hello preview</h1>}', '/styles.css':'body{color:green}'});
  expect(html).toContain('Hello preview');
  expect(html).toContain('color:green');
  expect(html).toContain('<div id="root"></div>');
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("showPreviewError");
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Script(match[1])).not.toThrow();
});
it("rejects server imports and invalid source before producing a preview", async () => {
  await expect(buildPreview({"/App.tsx":'import fs from "node:fs"; export default function App(){return null}'})).rejects.toThrow();
  await expect(buildPreview({"/App.tsx":'export default <'})).rejects.toThrow();
});
