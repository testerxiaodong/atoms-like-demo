"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Code2,
  Eye,
  History,
  Layers2,
  Monitor,
  Smartphone,
  Sparkles,
  Save,
  X,
  RotateCcw,
  Loader2,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileMap, Message, Project, Version } from "@/lib/types";
import { readAgentStream } from "@/lib/stream";
const Sandbox = dynamic(() => import("./sandbox"), {
  ssr: false,
  loading: () => (
    <div className="loading-state">
      <Loader2 className="spin" />
      正在准备预览环境…
    </div>
  ),
});
async function api(url: string, body?: unknown) {
  const res = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败，请重试。");
  return data;
}
export function Workspace({
  initialProject,
  initialMessages = [],
  isDemo = false,
  modelReady = false,
}: {
  initialProject: Project;
  initialMessages?: Message[];
  isDemo?: boolean;
  modelReady?: boolean;
}) {
  const [project, setProject] = useState(initialProject),
    [files, setFiles] = useState(initialProject.working_files),
    [source, setSource] = useState(initialProject.working_files);
  const [messages, setMessages] = useState(initialMessages),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stream, setStream] = useState(""),
    [steps, setSteps] = useState<string[]>([]);
  const [tab, setTab] = useState<"preview" | "code">("preview"),
    [mobile, setMobile] = useState(false),
    [history, setHistory] = useState(false),
    [versions, setVersions] = useState<Version[]>([]),
    [selected, setSelected] = useState<Version | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const stopRequested = useRef(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [sending, setSending] = useState(false);
  const dirty =
    !selected &&
    JSON.stringify(files) !== JSON.stringify(project.working_files);
  const locked = busy || !!project.active_run_id;
  const onChange = useCallback(
    (next: FileMap) =>
      setFiles((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      ),
    [],
  );
  const adopt = useCallback((p: Project) => {
    setProject(p);
    setFiles(p.working_files);
    setSource(p.working_files);
    setSelected(null);
  }, []);
  // Restore the browser-only draft after hydration; it cannot be read on the server.
  useEffect(() => {
    const pending = sessionStorage.getItem(`prompt:${initialProject.id}`);
    if (pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrompt(pending);
      sessionStorage.removeItem(`prompt:${initialProject.id}`);
    }
  }, [initialProject.id]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stream, steps]);
  useEffect(() => {
    if (!project.active_run_id || busy || isDemo) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const result = await api(
          `/api/projects/${project.id}/runs/${project.active_run_id}`,
        );
        if (result.run.status !== "running") {
          const data = await api(`/api/projects/${project.id}`);
          if (!stopped) {
            adopt(data.project);
            setMessages(data.messages);
          }
        }
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "加载失败");
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [project.active_run_id, project.id, busy, isDemo, adopt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function refresh() {
    try {
      const data = await api(`/api/projects/${project.id}`);
      adopt(data.project);
      setMessages(data.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "刷新失败");
    }
  }
  async function send() {
    if (!prompt.trim() || locked || isDemo || !modelReady || dirty || selected)
      return;
    const text = prompt.trim();
    const controller = new AbortController();
    requestAbort.current = controller;
    stopRequested.current = false;
    setSending(true);
    setBusy(true);
    setError("");
    setStream("");
    setSteps([]);
    setPrompt("");
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        project_id: project.id,
        run_id: null,
        role: "user",
        content: text,
        steps: [],
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const res = await fetch(`/api/projects/${project.id}/chat`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          revision: project.revision,
          requestKey: crypto.randomUUID(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await readAgentStream(res, (event) => {
        if (event.type === "run") {
          setRunId(event.id);
          if (stopRequested.current) {
            void api(`/api/projects/${project.id}/runs/${event.id}`, {})
              .then(() => controller.abort())
              .catch((e) => {
                setStopping(false);
                setError(e instanceof Error ? e.message : "停止失败，请重试");
              });
          }
        }
        if (event.type === "text") setStream((s) => s + event.text);
        if (event.type === "step") setSteps((s) => [...s, event.text]);
        if (event.type === "done") {
          adopt(event.project);
          setMessages((m) => [...m, event.message]);
          setStream("");
          setSteps([]);
        }
        if (event.type === "error") throw new Error(event.message);
      });
    } catch (e) {
      setError(controller.signal.aborted ? "已停止任务，原版本已保留。" : e instanceof Error ? e.message : "生成失败");
      setPrompt(text);
    } finally {
      setBusy(false);
      requestAbort.current = null;
      setSending(false);
      setStopping(false);
      setRunId(null);
      setStream("");
      setSteps([]);
      await refresh();
    }
  }
  async function stop() {
    const id = runId ?? project.active_run_id;
    if (stopping) return;
    if (!id) {
      stopRequested.current = true;
      setStopping(true);
      return;
    }
    setStopping(true);
    try {
      await api(`/api/projects/${project.id}/runs/${id}`, {});
      requestAbort.current?.abort();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "停止失败，请重试");
    } finally {
      setStopping(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/projects/${project.id}/save`, {
        files,
        revision: project.revision,
      });
      adopt(data.project);
      setMessages((m) => [...m, data.message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function openHistory() {
    setHistory(true);
    if (isDemo) return;
    setError("");
    try {
      const data = await api(`/api/projects/${project.id}/versions`);
      setVersions(data.versions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  async function inspect(v: Version) {
    if (dirty && !selected) {
      setError("请先保存当前修改，再查看历史版本。");
      return;
    }
    try {
      const data = await api(`/api/projects/${project.id}/versions/${v.id}`);
      setSelected(data.version);
      setSource(data.version.files);
      setFiles(data.version.files);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  async function restore() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/projects/${project.id}/restore`, {
        versionId: selected.id,
        revision: project.revision,
      });
      adopt(data.project);
      setMessages((m) => [...m, data.message]);
      setHistory(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace">
      <header className="workspace-header">
        <Link
          href={isDemo ? "/" : "/projects"}
          aria-label="返回项目"
          className="back-link"
        >
          <ArrowLeft size={17} />
        </Link>
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Layers2 size={17} />
          </span>
          forma
        </Link>
        <span className="header-divider" />
        <strong>{project.name}</strong>
        <span className="status-pill">
          {isDemo ? "示例项目" : `v${project.revision}`}
        </span>
        <div className="header-actions">
          <span className="save-status">
            {isDemo
              ? "修改仅在本次体验中保留"
              : selected
                ? `查看 v${selected.number}`
                : dirty
                  ? "有未保存的修改"
                  : "已保存"}
          </span>
          <Button
            variant="outline"
            disabled={isDemo || locked || !dirty || !!selected}
            onClick={save}
          >
            <Save />
            保存
          </Button>
          <Button variant="ghost" onClick={openHistory}>
            <History />
            版本历史
          </Button>
        </div>
      </header>
      <div className="workspace-body">
        <section className="chat-panel">
          <div className="chat-heading">
            <span>
              <Sparkles size={16} />
              构建助手
            </span>
            <span className="online-dot" />
          </div>
          <div className="chat-messages">
            <div className="assistant-intro">
              <span className="assistant-icon">
                <Sparkles size={19} />
              </span>
              <h2>一起把想法做出来。</h2>
              <p>
                {isDemo
                  ? "这是一个预置示例。试试右侧的待办交互，也可以切换到代码，修改文字与样式。"
                  : "告诉我你想构建什么，我会生成代码，并在右侧展示应用。你可以继续对话迭代。"}
              </p>
            </div>
            {isDemo && (
              <div className="demo-note">
                <span>✦ 示例体验</span>
                <p>支持添加、完成、删除和筛选待办。代码编辑会即时更新预览。</p>
                <small>
                  此示例没有调用 AI，也不会保存到云端。登录后可创建自己的项目。
                </small>
              </div>
            )}
            {messages.map((m) => (
              <div className={`message ${m.role}`} key={m.id}>
                <small>
                  {m.role === "user"
                    ? "你"
                    : m.role === "assistant"
                      ? "Forma"
                      : "项目动态"}
                </small>
                <p>{m.content}</p>
                {m.steps?.length > 0 && (
                  <details>
                    <summary>已记录 {m.steps.length} 条进展 · 查看过程</summary>
                    {m.steps.map((s, i) => (
                      <div key={i} className="step">
                        · {s}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))}
            {locked && (
              <div className="agent-progress">
                <small>
                  <Loader2 size={13} className="spin" />
                  正在回复 · {steps.length} 条进展
                </small>
                {steps.map((s, i) => (
                  <div key={i} className="step">
                    · {s}
                  </div>
                ))}
                {stream && <p>{stream}</p>}
                {!busy && <p>生成任务仍在运行，完成后自动刷新。</p>}
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="composer-wrap">
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <button onClick={() => setError("")} aria-label="关闭提示">
                  ×
                </button>
              </div>
            )}
            {selected && (
              <div className="config-note">
                正在查看历史版本。
                <button onClick={() => adopt(project)}>返回当前版本</button>
              </div>
            )}
            {!isDemo && !modelReady && (
              <p className="config-note">请配置模型 API 后开始生成。</p>
            )}
            {dirty && !selected && (
              <p className="config-note">
                {isDemo
                  ? "示例修改不会保存到云端。"
                  : "请保存代码修改后再继续对话。"}
              </p>
            )}
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                aria-label="给构建助手发消息"
                placeholder={
                  isDemo
                    ? "登录并创建项目后，开始和 AI 构建…"
                    : "描述你的想法，或告诉我如何调整…"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    e.nativeEvent.keyCode !== 229
                  ) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={isDemo || locked || !!selected || !modelReady}
                maxLength={4000}
              />
              <div>
                <span>
                  <Sparkles size={12} />
                  Enter 发送 · Shift+Enter 换行
                </span>
                {(sending || runId || project.active_run_id) ? <button
                  type="button"
                  className="send-button stop-button"
                  aria-label={stopping ? "正在停止" : "停止任务"}
                  title="停止任务"
                  disabled={stopping}
                  onClick={() => void stop()}
                >
                  {stopping ? <Loader2 size={17} className="spin" /> : <Square size={15} fill="currentColor" />}
                </button> : <button
                  className="send-button"
                  aria-label="发送消息"
                  disabled={
                    isDemo ||
                    locked ||
                    !modelReady ||
                    !prompt.trim() ||
                    dirty ||
                    !!selected
                  }
                >
                  <ArrowUp size={17} />
                </button>}
              </div>
            </form>
            <p className="composer-caption">
              每次构建，都是一个可以回溯的版本。
            </p>
          </div>
        </section>
        <section className="output-panel">
          <div className="preview-toolbar">
            <div className="view-tabs">
              <button
                className={tab === "preview" ? "active" : ""}
                onClick={() => setTab("preview")}
              >
                <Eye size={15} />
                预览
              </button>
              <button
                className={tab === "code" ? "active" : ""}
                onClick={() => setTab("code")}
              >
                <Code2 size={15} />
                代码
              </button>
            </div>
            <span className="preview-url">
              {selected ? `历史版本 v${selected.number}` : "应用预览"}
            </span>
            <div className="device-tabs">
              {!isDemo && <a href={`/api/projects/${project.id}/preview`} target="_blank" rel="noopener noreferrer" title="打开已保存版本的独立预览">独立预览 ↗</a>}
              <button
                aria-label="桌面预览"
                className={!mobile ? "active" : ""}
                onClick={() => setMobile(false)}
              >
                <Monitor size={15} />
              </button>
              <button
                aria-label="手机预览"
                className={mobile ? "active" : ""}
                onClick={() => setMobile(true)}
              >
                <Smartphone size={15} />
              </button>
            </div>
          </div>
          <div className="sandbox-frame">
            <Sandbox
              key={selected?.id ?? project.revision}
              files={source}
              templateVersion={
                selected?.template_version ?? project.template_version
              }
              onChange={onChange}
              tab={tab}
              mobile={mobile}
              readOnly={locked || !!selected}
            />
          </div>
          <div className="preview-footer">
            <span className="online-dot" />
            独立运行环境<span>React · 实时预览</span>
          </div>
        </section>
        {history && (
          <aside className="history-panel">
            <div className="chat-heading">
              <span>
                <History size={16} />
                版本历史
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="关闭历史"
                onClick={() => setHistory(false)}
              >
                <X />
              </Button>
            </div>
            <p>每次生成、保存和恢复都会留下快照。</p>
            {isDemo ? (
              <p className="history-empty">
                示例项目未连接云端。真实项目的版本会保存在数据库中。
              </p>
            ) : versions.length === 0 ? (
              <p className="history-empty">
                完成第一次构建后，版本会出现在这里。
              </p>
            ) : (
              versions.map((v) => (
                <button
                  className={`version-card ${selected?.id === v.id ? "selected" : ""}`}
                  key={v.id}
                  disabled={locked}
                  onClick={() => inspect(v)}
                >
                  <strong>
                    v{v.number}
                    <small>
                      {v.source === "ai"
                        ? "AI 构建"
                        : v.source === "restore"
                          ? "版本恢复"
                          : "手动保存"}
                    </small>
                  </strong>
                  <p>{v.summary}</p>
                  <time>{new Date(v.created_at).toLocaleString("zh-CN")}</time>
                </button>
              ))
            )}
            {selected && (
              <div className="restore-actions">
                <Button disabled={locked} onClick={restore}>
                  <RotateCcw />
                  恢复此版本
                </Button>
                <Button variant="ghost" onClick={() => adopt(project)}>
                  回到当前版本
                </Button>
                <small>恢复将创建新版本，原有历史会保留。</small>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
