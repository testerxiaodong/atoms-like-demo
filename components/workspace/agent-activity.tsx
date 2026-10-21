"use client";
import { FilePlus2, FilePenLine, FileMinus2, FileSearch } from "lucide-react";

const filePattern =
  /^(新增|更新|删除|读取)源码：(\/[A-Za-z0-9_\-/]+\.(?:tsx?|css))$/;
const icons = {
  新增: FilePlus2,
  更新: FilePenLine,
  删除: FileMinus2,
  读取: FileSearch,
};
type Operation = keyof typeof icons;

export function AgentActivity({
  steps,
  pending = false,
}: {
  steps: string[];
  pending?: boolean;
}) {
  const operations = new Map<string, { action: Operation; path: string }>();
  const progress: string[] = [];
  for (const step of steps) {
    const match = step.match(filePattern);
    if (match)
      operations.set(match[2], {
        action: match[1] as Operation,
        path: match[2],
      });
    else progress.push(step);
  }
  return (
    <div className="agent-activity">
      {operations.size > 0 && (
        <div className="agent-file-list" aria-label="文件操作">
          <div className="agent-file-heading">
            <span>本轮文件</span>
            <small>{operations.size} 个</small>
          </div>
          {[...operations.values()].map(({ action, path }) => {
            const Icon = icons[action];
            return (
              <div className="agent-file-row" key={path}>
                <Icon size={15} aria-hidden="true" />
                <code title={path}>{path}</code>
                <span
                  className={`file-operation ${action === "删除" ? "removed" : ""}`}
                >
                  {action}
                </span>
              </div>
            );
          })}
          {pending && (
            <p className="agent-file-note">候选文件 · 校验通过后统一保存</p>
          )}
        </div>
      )}
      {progress.length > 0 &&
        (pending ? (
          <div className="agent-progress-lines">
            {progress.map((step, i) => (
              <div className="step" key={i}>
                · {step}
              </div>
            ))}
          </div>
        ) : (
          <details className="agent-progress-details">
            <summary>已记录 {steps.length} 条进展 · 查看过程</summary>
            {progress.map((step, i) => (
              <div className="step" key={i}>
                · {step}
              </div>
            ))}
          </details>
        ))}
    </div>
  );
}
