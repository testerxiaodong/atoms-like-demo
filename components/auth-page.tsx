"use client";
import Link from "next/link";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { BuildShowcase } from "./build-showcase";
import { useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { Layers2, Loader2 } from "lucide-react";
export function AuthPage({
  signup = false,
  configured,
  error: initialError = false,
  build = false,
}: {
  signup?: boolean;
  configured: boolean;
  error?: boolean;
  build?: boolean;
}) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      initialError
        ? "登录未完成或授权已失效，请重新登录。你的需求已保留。"
        : "",
    );
  async function login() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (
        build ||
        (initialError && sessionStorage.getItem("forma:build-intent") === "1")
      )
        sessionStorage.setItem("forma:build-intent", "1");
      else sessionStorage.removeItem("forma:build-intent");
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch {
      setBusy(false);
      setError("登录失败，请检查网络后重试。");
    }
  }
  const suffix = build ? "?next=build" : "";
  return (
    <main className="auth-shell">
      <Link className="brand" href="/">
        <Layers2 size={24} /> forma
      </Link>
      <div className="auth-layout">
        <aside className="auth-story">
          <span className="section-eyebrow">YOUR NEXT IDEA STARTS HERE</span>
          <h2>
            一个想法，
            <br />
            无限种可能。
          </h2>
          <p>代码、预览、版本，都在一个工作台。</p>
          <BuildShowcase compact />
        </aside>
        <section className="auth-card">
          <span className="hero-kicker">IDEA INTO FORM</span>
          <h1>{signup ? "让第一个想法成形。" : "欢迎回来。"}</h1>
          <p>
            {signup
              ? "创建账号，开始与 AI 一起构建。"
              : "登录后继续你的项目与灵感。"}
          </p>
          <Button
            className="primary-action"
            disabled={!hydrated || !configured || busy}
            onClick={login}
          >
            {busy ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <span className="google-mark" aria-hidden="true">
                G
              </span>
            )}
            {busy
              ? "正在前往 Google…"
              : signup
                ? "使用 Google 注册"
                : "使用 Google 登录"}
          </Button>
          <p className="auth-note">
            {signup
              ? "首次 Google 授权即创建账号，已有账号可直接继续。"
              : "使用 Google 安全登录，无需另设密码。"}
          </p>
          {build && (
            <p className="auth-note">
              你的需求已保留，登录成功后会自动开始构建。
            </p>
          )}
          {error && <Alert>{error}</Alert>}
          {!configured && <p role="alert">登录服务尚未配置，请稍后再试。</p>}
          <p>
            {signup ? "已经有账号？" : "第一次使用？"}{" "}
            <Link href={`${signup ? "/login" : "/signup"}${suffix}`}>
              {signup ? "去登录" : "创建账号"}
            </Link>
          </p>
          <Link className="muted-link" href="/">
            返回首页
          </Link>
        </section>
      </div>
      <p className="auth-footer">一点灵感，慢慢变成真实的作品。</p>
    </main>
  );
}
