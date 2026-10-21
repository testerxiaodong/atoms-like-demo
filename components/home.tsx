"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Layers2, Sparkles, Loader2, Code2, Eye, History } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { examples, getExample } from "@/lib/templates/examples";
export function Home({
  configured,
  signedIn = false,
  projects,
  resume = false,
  exampleId,
}: {
  configured: boolean;
  signedIn?: boolean;
  projects?: { id: string; name: string; updated_at: string }[];
  resume?: boolean;
  exampleId?: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loggingOut, setLoggingOut] = useState(false);
  const creating = useRef(false),
    resumed = useRef(false);
  const example = getExample(exampleId);
  async function create(text = prompt, continuing = false) {
    if (!text.trim() || creating.current) return;
    sessionStorage.setItem("forma:login-draft", text);
    if (example) sessionStorage.setItem("forma:example", example.id);
    else if (!continuing) sessionStorage.removeItem("forma:example");
    if (!signedIn) {
      router.push("/login?next=build");
      return;
    }
    creating.current = true;
    setBusy(true);
    setError("");
    try {
      const pending = sessionStorage.getItem("forma:created-project");
      if (pending && continuing) {
        router.replace(`/projects/${pending}`);
        return;
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: text.trim().slice(0, 40),
          exampleId:
            example?.id ||
            (continuing
              ? sessionStorage.getItem("forma:example")
              : undefined) ||
            undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败，请重试。");
      sessionStorage.setItem(`prompt:${data.project.id}`, text.trim());
      sessionStorage.setItem(`autostart:${data.project.id}`, "1");
      sessionStorage.setItem("forma:created-project", data.project.id);
      router.push(`/projects/${data.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
      creating.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const draft =
      example?.prompt || sessionStorage.getItem("forma:login-draft") || "";
    // Browser drafts are restored after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrompt(draft);
    if (
      (resume || sessionStorage.getItem("forma:build-intent") === "1") &&
      signedIn &&
      draft &&
      !resumed.current
    ) {
      resumed.current = true;
      void create(draft, true);
    }
    // Only consume the redirect intent on mount; editing the draft must not submit it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [example?.id]);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      sessionStorage.removeItem("forma:created-project");
      window.location.replace("/");
    } catch {
      setError("退出登录失败，请检查网络后重试。");
      setLoggingOut(false);
    }
  }
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Layers2 size={20} />
          </span>
          forma
        </Link>
        <nav aria-label="主导航">
          <Link href="/#examples">探索示例</Link>
          <a
            href="https://github.com/testerxiaodong/atoms-like-demo"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          {signedIn ? (
            <>
              <Link href="/projects">我的项目</Link>
              <button
                className="nav-quiet"
                disabled={!hydrated || loggingOut}
                onClick={logout}
              >
                {loggingOut ? "正在退出…" : "退出登录"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() =>
                  sessionStorage.setItem("forma:login-draft", prompt)
                }
              >
                登录
              </Link>
              <Link
                className="nav-pill"
                href="/signup"
                onClick={() =>
                  sessionStorage.setItem("forma:login-draft", prompt)
                }
              >
                注册
              </Link>
            </>
          )}
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-kicker">
            <span /> A LITTLE IDEA. A REAL APP.
          </div>
          <h1>
            让一个想法，
            <br />
            <em>成为你的作品。</em>
          </h1>
          <p className="hero-description">
            从一句描述开始，和 AI 一起构建、调整、创造。
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
              disabled={!hydrated}
              placeholder="比如，一个记录旅行灵感的小网站…"
              value={prompt}
              maxLength={4000}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="prompt-bottom">
              <span>
                <Sparkles size={15} /> 你的 AI 构建伙伴
              </span>
              <button
                className="primary-action"
                disabled={!hydrated || busy || !configured || !prompt.trim()}
              >
                {busy ? <Loader2 size={16} className="spin" /> : null}
                {busy ? "正在创建…" : "开始构建"}
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
              服务尚未配置，可以先浏览下方交互示例。
            </p>
          )}
          <div className="suggestions">
            {[
              "一个简洁的个人作品集",
              "带分类的灵感收藏夹",
              "每日习惯打卡应用",
            ].map((s) => (
              <button key={s} disabled={!hydrated} onClick={() => setPrompt(s)}>
                {s}
              </button>
            ))}
          </div>
        </section>
        {projects && (
          <section className="landing-section">
            <div className="section-heading">
              <h2>我的项目</h2>
              <span>{projects.length} 个项目</span>
            </div>
            {projects.length ? (
              <div className="project-grid">
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="project-card"
                  >
                    <div className="project-cover">
                      <Layers2 size={30} />
                      <span>{p.name.slice(0, 20)}</span>
                    </div>
                    <div className="card-meta">
                      <strong>{p.name}</strong>
                      <small>
                        {new Date(p.updated_at).toLocaleDateString("zh-CN")}{" "}
                        更新
                      </small>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="empty-projects">
                还没有项目。在上方写下第一个想法吧。
              </p>
            )}
          </section>
        )}
        <section className="landing-section" id="examples">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">MADE TO EXPLORE</span>
              <h2>小作品，大可能。</h2>
            </div>
            <p>预置交互示例 · 无需登录即可体验</p>
          </div>
          <div className="example-grid">
            {examples.map((item, i) => (
              <article className={`example-card ${item.color}`} key={item.id}>
                <Link
                  className="example-art"
                  href={`/demo?example=${item.id}`}
                  aria-label={`预览${item.name}`}
                >
                  <span className="example-number">
                    0{i + 1} / {item.category}
                  </span>
                  {item.id === "tasks" ? (
                    <div className="art-tasks">
                      <strong>
                        留一点时间，
                        <br />
                        做喜欢的事。
                      </strong>
                      <span>○ 整理今天的小事</span>
                      <span>● 收集一个好想法</span>
                    </div>
                  ) : item.id === "timer" ? (
                    <div className="art-timer">
                      <span>FOCUS TIME</span>
                      <strong>25:00</strong>
                      <i>给自己一段留白</i>
                    </div>
                  ) : item.id === "studio" ? (
                    <div className="art-studio">
                      <span>山间</span>
                      <strong>
                        Less, but
                        <br />
                        with feeling.
                      </strong>
                    </div>
                  ) : (
                    <div className="art-dashboard">
                      <strong>
                        12,840<small>本周的每一点生长</small>
                      </strong>
                      <div>
                        {[38, 62, 45, 78, 56, 92, 75].map((h, n) => (
                          <i key={n} style={{ height: h }} />
                        ))}
                      </div>
                    </div>
                  )}
                </Link>
                <div className="example-meta">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div>
                    <Link href={`/demo?example=${item.id}`}>查看示例</Link>
                    <Link href={`/?example=${item.id}`}>基于此示例创建</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="feature-strip" aria-label="产品能力">
          {[
            {
              icon: Code2,
              title: "代码，由你掌握",
              text: "随时查看源码，继续打磨每一个细节。",
            },
            {
              icon: Eye,
              title: "想法，即刻可见",
              text: "在右侧实时预览，直接操作你的作品。",
            },
            {
              icon: History,
              title: "每一步，都有迹可循",
              text: "保存版本，放心尝试，随时回到之前。",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="landing-footer">
        <span>FORMA / IDEA INTO FORM</span>
        <nav>
          <a
            href="https://github.com/testerxiaodong/atoms-like-demo"
            target="_blank"
            rel="noopener noreferrer"
          >
            项目源码
          </a>
          <a
            href="https://github.com/testerxiaodong/atoms-like-demo#readme"
            target="_blank"
            rel="noopener noreferrer"
          >
            使用说明
          </a>
          <a
            href="https://atoms.dev/zh"
            target="_blank"
            rel="noopener noreferrer"
          >
            参考产品 Atoms
          </a>
        </nav>
      </footer>
    </div>
  );
}
