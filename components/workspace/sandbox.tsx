"use client";
import {
  SandpackProvider,
  SandpackCodeEditor,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { useEffect, useMemo, useState } from "react";
import { runtimeFiles, runtimeDependencies } from "@/lib/templates/react";
import type { FileMap } from "@/lib/types";
// Sandpack resets its file state when customSetup identity changes.
const customSetup = { dependencies: runtimeDependencies };
function LivePreview({ paths }: { paths: string[] }) {
  const { sandpack } = useSandpack();
  const signature = JSON.stringify(Object.fromEntries(paths.map(p => [p, sandpack.files[p]?.code ?? ""])));
  const [result, setResult] = useState<{ signature: string; html: string; error: string } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: JSON.parse(signature) }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "预览编译失败");
        if (!controller.signal.aborted) setResult({ signature, html: data.html, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ signature, html: "", error: error instanceof Error ? error.message : "预览加载失败" });
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [signature, revision]);
  const pending = result?.signature !== signature;
  return (
    <div className="local-preview">
      {pending && <div className="preview-status" role="status">正在编译预览…</div>}
      {!pending && result?.error && <div className="preview-status" role="alert">{result.error}</div>}
      {!pending && result?.html && <iframe key={revision} title="应用实时预览" sandbox="allow-scripts" srcDoc={result.html} />}
      <button className="preview-reload" type="button" aria-label="刷新预览" onClick={() => setRevision(v => v + 1)}>↻</button>
    </div>
  );
}
function FileTree({ paths }: { paths: string[] }) {
  const { sandpack } = useSandpack();
  return (
    <nav className="file-tree" aria-label="项目文件">
      {paths.map((p) => (
        <button
          key={p}
          className={sandpack.activeFile === p ? "active" : ""}
          onClick={() => sandpack.setActiveFile(p)}
        >
          {p.slice(1)}
        </button>
      ))}
    </nav>
  );
}
function Changes({
  onChange,
  paths,
}: {
  onChange: (files: FileMap) => void;
  paths: string[];
}) {
  const { sandpack } = useSandpack();
  useEffect(() => {
    const files: FileMap = {};
    for (const path of paths)
      if (sandpack.files[path]) files[path] = sandpack.files[path].code;
    onChange(files);
  }, [sandpack.files, onChange, paths]);
  return null;
}
export default function Sandbox({
  files,
  templateVersion,
  onChange,
  tab,
  mobile,
  readOnly,
}: {
  files: FileMap;
  templateVersion: string;
  onChange: (files: FileMap) => void;
  tab: "preview" | "code";
  mobile: boolean;
  readOnly: boolean;
}) {
  const source = useMemo(
    () => runtimeFiles(files, templateVersion),
    [files, templateVersion],
  );
  const paths = useMemo(() => Object.keys(files), [files]);
  const options = useMemo(
    () => ({
      activeFile: "/App.tsx",
      visibleFiles: paths,
      recompileMode: "delayed" as const,
      recompileDelay: 600,
      autorun: false,
    }),
    [paths],
  );
  return (
    <SandpackProvider
      template="react-ts"
      files={source}
      customSetup={customSetup}
      options={options}
      theme="light"
    >
      <Changes onChange={onChange} paths={paths} />
      <div
        className="code-area"
        style={{ display: tab === "code" ? "flex" : "none" }}
      >
        <FileTree paths={paths} />
        <SandpackCodeEditor
          showLineNumbers
          showTabs
          closableTabs={false}
          readOnly={readOnly}
        />
      </div>
      <div
        className={`preview-area ${mobile ? "mobile-preview" : ""}`}
        style={{ display: tab === "preview" ? "flex" : "none" }}
      >
        <LivePreview paths={paths} />
      </div>
    </SandpackProvider>
  );
}
