import type { FileMap } from "@/lib/types";

export const TEMPLATE_VERSION = "react-v1";

export const emptyFiles: FileMap = {
  "/App.tsx": `import React from "react";
import "./styles.css";

export default function App() {
  return <main className="welcome">
    <span className="badge">YOUR NEXT IDEA</span>
    <h1>从一个想法开始。</h1>
    <p>在左侧描述你想构建的应用，这里将成为它的第一个版本。</p>
    <div className="orb">✦</div>
  </main>;
}`,
  "/styles.css": `*{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#252b27;font-family:system-ui,-apple-system,sans-serif}.welcome{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center}.badge{font-size:11px;letter-spacing:3px;color:#688071}h1{font-size:clamp(28px,5vw,46px);font-weight:500;letter-spacing:-2px;margin:24px 0 12px}p{font-size:14px;color:#7b817c;line-height:1.8}.orb{margin-top:40px;display:grid;place-items:center;width:100px;height:100px;border-radius:32px;background:#e3ebe0;color:#3e6549;font-size:48px;transform:rotate(-8deg)}`,
};

export const demoFiles: FileMap = {
  "/App.tsx": `import React, { useState } from "react";
import "./styles.css";

type Task = { id: number; title: string; done: boolean; tag: string };
const initial: Task[] = [
  { id: 1, title: "整理本周的产品灵感", done: false, tag: "创作" },
  { id: 2, title: "为新项目画一张草图", done: false, tag: "设计" },
  { id: 3, title: "读完收藏的那篇文章", done: true, tag: "学习" },
];
export default function App() {
  const [tasks, setTasks] = useState(initial);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("全部");
  const completed = tasks.filter(t => t.done).length;
  const visible = tasks.filter(t => filter === "全部" || (filter === "已完成" ? t.done : !t.done));
  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setTasks([...tasks, { id: Date.now(), title: input.trim(), done: false, tag: "生活" }]);
    setInput("");
  }
  return <main>
    <header><div className="logo">◒ <span>little things</span></div><span className="date">MAKE ROOM FOR WHAT MATTERS</span></header>
    <section className="intro"><span className="eyebrow">YOUR DAILY SPACE</span><h1>留一点时间，<br/><em>做喜欢的事。</em></h1><p>不必一次完成所有事。今天，先从一件小事开始。</p></section>
    <section className="board"><div className="board-top"><h2>今天的小事 <span>{tasks.length}</span></h2><span className="progress">{completed} / {tasks.length} 已完成</span></div>
      <div className="filters">{["全部", "待完成", "已完成"].map(f => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
      <div className="tasks">{visible.map(t => <div className={"task " + (t.done ? "done" : "")} key={t.id}><button className="check" aria-label={"完成 " + t.title} onClick={() => setTasks(tasks.map(x => x.id === t.id ? {...x, done: !x.done} : x))}>{t.done ? "✓" : ""}</button><span className="title">{t.title}</span><span className="tag">{t.tag}</span><button className="remove" aria-label={"删除 " + t.title} onClick={() => setTasks(tasks.filter(x => x.id !== t.id))}>×</button></div>)}{visible.length === 0 && <p className="empty">这里暂时没有小事，享受片刻轻松。</p>}</div>
      <form onSubmit={add}><span>＋</span><input aria-label="添加一件小事" value={input} onChange={e => setInput(e.target.value)} placeholder="添加一件想做的小事…"/><button disabled={!input.trim()}>添加 ↗</button></form>
    </section><footer>Small steps. A little more you. <span>✳</span></footer>
  </main>;
}`,
  "/styles.css": `*{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#333b34;font-family:system-ui,-apple-system,sans-serif}button,input{font:inherit}button{cursor:pointer}main{max-width:760px;margin:auto;padding:32px 42px}header{display:flex;align-items:center;justify-content:space-between;gap:16px}.logo{display:flex;align-items:center;gap:9px;font-size:25px;color:#56714e}.logo span{font-size:16px;font-weight:650;letter-spacing:-.5px}.date{font-size:8px;letter-spacing:1.5px;color:#969a8e}.intro{padding:55px 0 35px}.eyebrow{font-size:9px;letter-spacing:2px;color:#8b947e}h1{font-size:42px;font-weight:500;line-height:1.45;letter-spacing:-2px;margin:18px 0 14px}h1 em{font-style:normal;color:#7c8e66}.intro p{font-size:12px;color:#999c91}.board{background:white;border:1px solid #e9e9df;border-radius:14px;padding:23px;box-shadow:0 8px 35px #283b2804}.board-top{display:flex;justify-content:space-between;align-items:center}h2{font-size:14px;font-weight:600;margin:0}h2 span{margin-left:8px;background:#f1f3ec;padding:2px 6px;border-radius:5px;font-size:10px;color:#7a886c}.progress{font-size:10px;color:#92998b}.filters{display:flex;gap:8px;margin:20px 0 10px}.filters button{border:0;background:transparent;color:#969a90;font-size:11px;padding:6px 10px;border-radius:6px}.filters button.active{background:#eff3e9;color:#62764d}.task{display:flex;align-items:center;gap:12px;padding:17px 0;border-bottom:1px solid #f1f2ec}.check{flex:none;width:18px;height:18px;border:1px solid #d7dece;border-radius:5px;color:white;background:white;font-size:12px}.done .check{background:#90a47c;border-color:#90a47c}.title{font-size:12px;flex:1}.done .title{text-decoration:line-through;color:#adb2a5}.tag{font-size:9px;background:#f6f4ec;color:#9b947e;padding:4px 7px;border-radius:4px}.remove{border:0;background:transparent;color:#b9bcaf;font-size:18px}form{display:flex;align-items:center;gap:8px;margin-top:18px;background:#f8f9f5;border-radius:7px;padding:9px 12px;color:#91a17e}input{width:100%;min-width:0;flex:1;border:0;outline:0;background:transparent;font-size:11px;color:#4b5745}form button{border:0;background:transparent;color:#718663;font-size:10px;white-space:nowrap}form button:disabled{opacity:.4;cursor:default}footer{display:flex;justify-content:space-between;align-items:center;margin:26px 0;font-size:10px;letter-spacing:.3px;color:#a5aa9c}footer span{font-size:25px;color:#bdc9ad}.empty{font-size:12px;text-align:center;padding:24px;color:#9da58e}@media(max-width:500px){main{padding:24px}.date{display:none}h1{font-size:32px}.intro{padding-top:40px}.board{padding:16px}.tag{display:none}}`,
};

export function runtimeFiles(
  files: FileMap,
  templateVersion = TEMPLATE_VERSION,
) {
  if (templateVersion !== TEMPLATE_VERSION)
    throw new Error("不支持的项目模板版本");
  return {
    ...files,
    "/index.tsx": {
      code: `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);`,
      hidden: true,
      readOnly: true,
    },
  };
}

export const runtimeDependencies = {
  react: "18.3.1",
  "react-dom": "18.3.1",
  "lucide-react": "0.468.0",
};
