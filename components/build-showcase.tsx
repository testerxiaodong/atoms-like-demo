import { Check, Code2, Layers2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "./ui/badge";
import styles from "./build-showcase.module.css";

/** A labelled illustration of the workflow, not a fabricated live generation. */
export function BuildShowcase({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.scene} ${compact ? styles.compact : ""}`}>
      <div className={styles.window}>
        <div className={styles.toolbar}>
          <Layers2 size={16} />
          <span>我的灵感工作台</span>
          <Badge>示例</Badge>
        </div>
        <div className={styles.canvas}>
          <span className={styles.eyebrow}>MAKE SPACE FOR WHAT MATTERS</span>
          <h2>
            小事，也值得
            <br />
            认真对待。
          </h2>
          <p>留一点时间，做喜欢的事。</p>
          <div className={styles.task}>
            <span className={styles.checked}>
              <Check size={14} />
            </span>
            <s>收集一个好想法</s>
            <small>完成</small>
          </div>
          <div className={styles.task}>
            <span className={styles.unchecked} />
            整理今天的小事<small>今天</small>
          </div>
          <Link href="/demo?example=tasks" className={styles.tryLink}>
            体验这个示例
          </Link>
        </div>
        <div className={styles.bottom}>
          <Code2 size={14} /> 代码可编辑 <span>预览可交互</span>
        </div>
      </div>
      <div className={styles.caption}>
        <Sparkles size={16} />
        <span>描述想法 · 生成代码 · 继续打磨</span>
      </div>
    </div>
  );
}
