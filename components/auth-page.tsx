"use client";
import Link from "next/link";
import { useState } from "react";
import { Layers2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
      <section className="auth-card">
        <span className="hero-kicker">IDEA INTO FORM</span>
        <h1>{signup ? "让第一个想法成形。" : "欢迎回来。"}</h1>
        <p>
          {signup
            ? "创建账号，开始与 AI 一起构建。"
            : "登录后继续你的项目与灵感。"}
        </p>
        <button
          className="primary-action"
          disabled={!configured || busy}
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
        </button>
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
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
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
      <p className="auth-footer">一点灵感，慢慢变成真实的作品。</p>
    </main>
  );
}
