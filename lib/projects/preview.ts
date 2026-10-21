import { build } from "esbuild";
import path from "node:path";
import type { FileMap } from "@/lib/types";
import { assertFileLimits, validateFiles } from "./files";

export async function buildPreview(files: FileMap) {
  assertFileLimits(files);
  const errors = validateFiles(files);
  if (errors.length) throw new Error(errors.slice(0, 3).join("；"));
  const result = await build({
    stdin: {
      contents: 'import React from "react";import {createRoot} from "react-dom/client";import App from "/App.tsx";createRoot(document.getElementById("root"),{onUncaughtError:(error)=>window.showPreviewError(String(error))}).render(<App/>);',
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
      name: "project-files",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, async (args) => {
          if (args.namespace !== "project" && args.importer !== "<stdin>") return;
          if (["react", "react-dom", "react-dom/client", "react/jsx-runtime", "lucide-react"].includes(args.path))
            return builder.resolve(args.path, { resolveDir: process.cwd(), kind: "import-statement" });
          const base = args.path.startsWith("/") ? args.path
            : path.posix.resolve(path.posix.dirname(args.importer), args.path);
          const file = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]
            .find((name) => Object.hasOwn(files, name));
          if (!file) return { errors: [{ text: `不支持的导入：${args.path}` }] };
          return { path: file, namespace: "project" };
        });
        builder.onLoad({ filter: /.*/, namespace: "project" }, (args) => {
          if (args.path.endsWith(".css"))
            return { contents: `const s=document.createElement("style");s.textContent=${JSON.stringify(files[args.path])};document.head.appendChild(s);`, loader: "js" };
          return { contents: files[args.path], loader: args.path.endsWith(".tsx") ? "tsx" : "ts" };
        });
      },
    }],
  });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; font-src data: https:; connect-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>作品预览</title><style>body{margin:0}</style></head><body><div id="root"></div><script>document.addEventListener('click',e=>{const a=e.target.closest?.('a[href^="#"]');if(a){e.preventDefault();const id=a.getAttribute('href').slice(1);if(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth'});}else{window.scrollTo({top:0,behavior:'smooth'});}}});function showPreviewError(message){let el=document.getElementById('preview-error');if(!el){el=document.createElement('pre');el.id='preview-error';el.style.cssText='position:fixed;inset:16px;z-index:2147483647;background:#fff3f0;color:#922;padding:20px;white-space:pre-wrap;overflow:auto';document.body.appendChild(el);}el.textContent='应用运行出错：'+message;}window.addEventListener('error',e=>showPreviewError(e.message));window.addEventListener('unhandledrejection',e=>showPreviewError(String(e.reason)));</script><script>${script}</script></body></html>`;
}
