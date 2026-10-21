"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  Layers2,
  Sparkles,
  Plus,
  LogOut,
  FolderOpen,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
export function Home({
  configured,
  signedIn = false,
  projects = [],
  authError = false,
}: {
  configured: boolean;
  signedIn?: boolean;
  authError?: boolean;
  projects?: { id: string; name: string; updated_at: string }[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(authError ? "登录未完成或授权已失效，请重新登录。你的需求已保留。" : "");
  const [loggingOut, setLoggingOut] = useState(false);
  const loginDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const draft = sessionStorage.getItem("forma:login-draft");
    if (draft !== null) {
      // Restore the local draft only after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrompt(draft);
      sessionStorage.removeItem("forma:login-draft");
    }
  }, []);
  function openLogin() {
    setError("");
    loginDialog.current?.showModal();
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      // Load a fresh server-rendered page after the session cookies are removed.
      window.location.replace("/");
    } catch {
      setError("退出登录失败，请检查网络后重试。");
      setLoggingOut(false);
    }
  }
  async function login() {
    setError("");
    setBusy(true);
    try {
      sessionStorage.setItem("forma:login-draft", prompt);
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
          // Signing out of Forma does not end the browser's Google session.
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch {
      setError("登录失败，请检查 Google 登录配置。");
      setBusy(false);
    }
  }
  async function create() {
    if (!signedIn) {
      openLogin();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prompt.trim().slice(0, 40) || "未命名项目",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (prompt.trim())
        sessionStorage.setItem(`prompt:${data.project.id}`, prompt.trim());
      router.push(`/projects/${data.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
      setBusy(false);
    }
  }
  return (
    <div className="home-shell">
      <aside className="home-sidebar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Layers2 size={20} />
          </span>
          forma<span className="beta">BETA</span>
        </Link>
        <button
          className="side-new"
          onClick={() => document.querySelector("textarea")?.focus()}
        >
          <Plus size={16} />
          创建新项目<span>↗</span>
        </button>
        <div className="side-label">工作空间</div>
        <Link className="side-item active" href={signedIn ? "/projects" : "/"}>
          <FolderOpen size={17} />
          我的项目
        </Link>
        <Link className="side-item" href="/demo">
          <Sparkles size={17} />
          探索示例
        </Link>
        <div className="sidebar-bottom">
          <div className="mini-orb">✳</div>
          <p>让想法，有形状。</p>
          <small>Built with curiosity.</small>
        </div>
      </aside>
      <div className="home-content">
        <nav className="topbar">
          <span>你的下一件作品，从这里开始。</span>
          {signedIn ? (
            <Button
              variant="ghost"
              disabled={loggingOut}
              onClick={logout}
            >
              {loggingOut ? <Loader2 className="spin" /> : <LogOut />}
              {loggingOut ? "正在退出…" : "退出登录"}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={!configured || busy}
              onClick={openLogin}
            >
              注册 / 登录
              <ArrowUpRight />
            </Button>
          )}
        </nav>
        <main className="home-main">
          <div className="hero-kicker">
            <span />A LITTLE IDEA. A REAL APP.
          </div>
          <h1>
            脑海里的想法，
            <br />
            <span>现在就让它发生。</span>
          </h1>
          <p className="hero-description">
            描述你想做的应用。和 AI 一起构建、调整，看到它成为现实。
          </p>
          <form
            className="prompt-box"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <textarea
              aria-label="描述你的应用"
              placeholder="我想做一个……"
              value={prompt}
              maxLength={4000}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="prompt-bottom">
              <span>
                <Sparkles size={14} />
                你的 AI 构建伙伴
              </span>
              <button
                className="send-button"
                aria-label="创建应用"
                disabled={busy || !configured}
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {!configured && (
            <p className="config-note">
              云端服务尚未配置。可以先{" "}
              <Link href="/demo">体验可交互示例 ↗</Link>
            </p>
          )}
          <div className="suggestions">
            {[
              "一个简洁的个人作品集",
              "带分类的灵感收藏夹",
              "每日习惯打卡应用",
            ].map((s) => (
              <button key={s} onClick={() => setPrompt(s)}>
                {s}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          <section className="project-section">
            <div className="section-heading">
              <h2>{signedIn ? "我的项目" : "从一个小作品开始"}</h2>
              <span>
                {signedIn ? `${projects.length} 个项目` : "想法 → 对话 → 应用"}
              </span>
            </div>
            <div className="project-grid">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="project-card"
                >
                  <div className="project-cover">
                    <Layers2 size={38} />
                    <span>{p.name.slice(0, 16)}</span>
                  </div>
                  <div className="card-meta">
                    <strong>{p.name}</strong>
                    <small>
                      {new Date(p.updated_at).toLocaleDateString("zh-CN")} 更新
                    </small>
                  </div>
                </Link>
              ))}
              <Link href="/demo" className="project-card">
                <div className="project-cover sample-cover">
                  <span className="cover-eyebrow">LITTLE THINGS</span>
                  <strong>
                    留一点时间，
                    <br />
                    做喜欢的事。
                  </strong>
                  <div className="mock-task">
                    ○ 整理今天的小事<span>✳</span>
                  </div>
                </div>
                <div className="card-meta">
                  <strong>
                    小事清单 <span className="sample-tag">交互示例</span>
                  </strong>
                  <small>
                    打开、编辑，看看应用如何运行
                    <ArrowUpRight size={13} />
                  </small>
                </div>
              </Link>
              <button
                className="new-card"
                onClick={() => document.querySelector("textarea")?.focus()}
              >
                <span>
                  <Plus size={22} />
                </span>
                <strong>你的下一个想法</strong>
                <small>不需要从空白代码开始</small>
              </button>
            </div>
          </section>
        </main>
        <footer className="home-footer">
          <span>FORMA / IDEA INTO FORM</span>
          <span>一点灵感，无限可能。</span>
        </footer>
      </div>
      <dialog
        ref={loginDialog}
        className="login-dialog"
        aria-labelledby="login-title"
        aria-describedby="login-description"
        onClick={(e) => {
          if (e.target === e.currentTarget) loginDialog.current?.close();
        }}
      >
        <section className="login-dialog-content">
          <button type="button" className="login-close" aria-label="关闭登录窗口" onClick={() => loginDialog.current?.close()}>
            <X size={20} />
          </button>
          <div className="mini-orb"><Layers2 size={26} /></div>
          <h2 id="login-title">欢迎来到 Forma</h2>
          <p id="login-description">登录后即可生成应用、保存项目，并随时继续创作。</p>
          <Button disabled={!configured || busy} onClick={login}>
            {busy ? <Loader2 className="spin" /> : <ArrowUpRight />}
            {busy ? "正在前往 Google…" : "使用 Google 注册 / 登录"}
          </Button>
          <p className="login-note">首次使用会自动创建账号。你输入的需求会保留。</p>
          {error && <p className="error-banner" role="alert">{error}</p>}
          {!configured && <p role="alert">登录服务尚未配置，请稍后再试。</p>}
        </section>
      </dialog>
    </div>
  );
}
