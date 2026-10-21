"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading-state">
      <h1>暂时无法加载页面</h1>
      <p>请检查服务配置，或稍后重试。</p>
      <button onClick={reset}>重新加载</button>
      <Link href="/">返回首页</Link>
    </main>
  );
}
