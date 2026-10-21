# Forma

通过单个 AI Agent 生成和迭代 React 应用，提供代码编辑、右侧交互预览与版本恢复。

- **评审先读：[交付说明](docs/DELIVERY.md)** — 实现思路、关键取舍、完成范围、验证证据与后续优先级。
- [在线演示](https://forma.coder-cengdong.site) · [测试文档](docs/TESTING.md) · [GitHub Actions](https://github.com/testerxiaodong/atoms-like-demo/actions)
- [演示启停与登录配置](docs/DEMO_ACCESS.md)

## 当前能力

Google 登录、独立登录/注册页面、匿名交互示例、输入需求后自动创建并开始生成；项目和消息云端持久化；逐文件候选进度；编辑、保存与 iframe 预览；停止和失败后重试；版本历史与恢复；项目操作菜单和确认删除。

扩展能力为版本迭代：生成、手动保存、恢复都创建新版本，历史保留，后续 Agent 从当前版本继续。注册采用 Google 首次授权建号，不提供邮箱密码注册。生成作品自身的业务后端不在当前范围内。

当前演示由 **本机生产构建 + Codex CLI + Cloudflare 固定域名隧道 + Supabase** 提供。电脑和服务必须在线；演示共用一个模型执行名额。不是已完成 Vercel 托管的全天候部署。

## 本地运行

需要 Node.js 22+。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

访问 `http://localhost:3000`。未配置服务时，可以在 `/demo` 体验明确标注的预置示例；不会调用模型或保存到数据库。

### 数据库与登录

1. 创建自己的 Supabase 项目，按文件名顺序执行 `supabase/migrations/` 中的 **全部 SQL**，每个迁移执行一次。当前共四个迁移，包含无代码变更对话、运行超时和项目删除。
2. 在 `.env.local` 填入 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`NEXT_PUBLIC_APP_URL`。
3. 在 Supabase 启用 Google provider。Google OAuth 回调使用 Supabase 提供的 `/auth/v1/callback`；Supabase 允许的应用回调为实际站点的 `/auth/callback`。详细步骤见 [演示访问说明](docs/DEMO_ACCESS.md)。

`projects`、`messages`、`versions`、`runs` 通过 RLS 隔离读取，写入只允许经过限定的事务 RPC。业务应用不需要 service role key；真实云端测试的管理凭据单独放在忽略提交的配置中。

### 模型选择

**API 模式：** 在 `.env.local` 设置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`，使用兼容 Chat Completions、流式响应及工具调用的端点；不要设置 `AGENT_BACKEND=codex-local`。AI SDK 单 Agent 最多循环 8 步，单次生成上限 100 秒。

**本机 Codex 模式：** 完成自己的 `codex login`，配置：

```dotenv
AGENT_BACKEND=codex-local
CODEX_CLI_PATH=/absolute/path/to/codex
```

本地开发可用；生产构建需显式开启演示模式，Vercel 环境不启用此后端。CLI 使用临时只读目录并禁用 shell、浏览器、应用等工具；只接收提供的项目上下文，逐个返回完整候选源码和最终文件清单。候选内容通过校验、编译和版本事务后才保存。转发公开进展，不展示内部推理；本机任务上限 300 秒。

所有模式限制最多 20 个文件、单文件 100 KB、项目文件总量 300 KB。固定运行入口和依赖由平台管理，当前允许 React、React DOM、Lucide；esbuild 使用仓库安装的 React 19 运行时打包。

## 演示与部署

已有固定域名配置的机器上：

```sh
npm run demo:stop
npm run build
npm run demo:start
npm run demo:status
# 演示结束
npm run demo:stop
```

也可使用根目录的 macOS 启停脚本。克隆仓库不会获得私有域名、隧道凭据或 Codex 登录态；首次配置见 [演示访问说明](docs/DEMO_ACCESS.md)。

如部署到 Vercel，需要先配置模型 API、Supabase 和精确的站点/登录回调，不能上传本机订阅配置来运行 Codex CLI。路由 `maxDuration=120`，宿主需支持相应时长与流式响应；本项目尚无后台任务队列，部署后应重新验收真实长任务。

## 实现结构

```text
app/                         页面、认证回调与 HTTP 接口
components/
  home.tsx                   首页和项目列表
  auth-page.tsx              登录与注册入口
  project-actions.tsx        项目菜单和删除弹窗
  workspace/
    workspace.tsx            工作区状态与操作编排
    agent-activity.tsx       文件操作和进展展示
    sandbox.tsx              CodeMirror 编辑器与 iframe 预览
  ui/                        通用 UI 基础
lib/
  agent/                     API Agent、Codex 适配、候选文件协议
  projects/                  鉴权、文件边界、源码校验和 esbuild 编译
  supabase/                  客户端与服务端数据库连接
  templates/                 模板与匿名示例
supabase/migrations/         表、RLS 与事务函数
tests/                       单元、组件、集成、HTTP、浏览器及公网测试
scripts/testing/             隔离测试服务、云端编排与清理
scripts/demo/                演示启动和停止
```

生成代码在受限 iframe 中运行，服务端仅编译。平台限制联网、父页面访问和表单提交；此隔离方案也限制生成作品的外部服务能力。版本号和行锁处理冲突，停止或失败不会提交半成品。

## 验证

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

2026-10-21 的功能提交 `ae929e5`：[CI 通过](https://github.com/testerxiaodong/atoms-like-demo/actions/runs/39575349967)，默认 Vitest 75 项通过、2 项跳过，Playwright 55 项通过、3 项跳过。浏览器与 HTTP 默认套件运行真实 Next.js 服务和 SQL 迁移，使用隔离的身份适配器及确定性模型；真实云端数据库、Google 授权和真实 Codex 分别验收，不能互相替代。

真实服务测试会消耗模型额度或创建专用云端账号，不进入默认 CI。运行方式、补跑结果、清理凭证规则及已知失败见 [测试文档](docs/TESTING.md)。本地与云端测试共用端口及报告目录，需串行运行；共享数据库测试需安排无写入窗口。

## 边界与后续

尚未实现生成作品的业务数据库、自动浏览器修复、后台队列、作品独立发布、GitHub 同步、多人协作或完整配额系统。公网创建接口曾测得约 3.44–5.27 秒，模型生成可达数分钟；当前预览校验不能替代作品的实际业务验收。

优先提升部署可靠性与响应速度，再完善自动校验、作品导出和发布；详见 [交付说明](docs/DELIVERY.md)。早期方案见 [架构草案](MVP_ARCHITECTURE.md)，历史阶段记录见 [开发记录](docs/DEVELOPMENT_HISTORY.md)；两者不替代当前部署指南。
