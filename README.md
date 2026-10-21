# Forma — Atoms-like Demo

通过单个 AI Agent 生成和迭代 React 应用，提供代码编辑、实时预览与版本恢复。

发布前回归、默认跳过的 5 项真实服务测试、运行命令与补跑记录见 [测试文档](docs/TESTING.md)。

## 首页与创建流程

首页对所有访客开放，提供需求输入、4 个可交互预置示例以及源码、说明和参考产品链接。已登录用户提交需求后自动进入工作区并开始生成；未登录用户进入独立的 `/login` 或 `/signup` 页面，Google 授权后续接任务。注册沿用 Google 首次授权建号，不提供邮箱密码注册。

登录草稿和待执行意图保存在当前标签页的 sessionStorage，不放入外部授权 URL；OAuth 仍使用原有的精确 `/auth/callback` 地址。工作区消费一次性执行标记后清除，刷新或重开已有项目不会重发；失败或停止后恢复输入，允许重试。`/projects` 展示当前用户项目。示例可匿名预览，基于示例创建时复制对应源码到自己的项目。

## 本地启动

需要 Node.js 22+。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

打开 http://localhost:3000 。不填环境变量也能访问 `/demo`：这是明确标注的预置示例，可操作待办、编辑代码和切换桌面/手机预览；它不调用模型，也不保存到数据库。

## 接通真实服务

### 1. PostgreSQL / Supabase

在自己的 Supabase 项目 SQL Editor 中执行 `supabase/migrations/202610200001_initial.sql`（首次安装执行一次）。PostgreSQL 运行在该 Supabase 项目中，本地无需安装数据库。填入：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

表包括 `projects`、`messages`、`versions`、`runs`。用户通过 RLS 只能读取自己的数据。客户端没有直接写表权限；事务 RPC 使用固定 search_path 的 SECURITY DEFINER，并逐个核验 auth.uid()、项目所有者、版本号与生成锁。应用不使用 service role key。

### 2. Google 登录

在 Supabase Authentication 中启用 Google provider，填入自己的 Google OAuth Client ID/Secret。在 Google 控制台配置 Supabase 页面显示的回调 URL（`https://YOUR_PROJECT.supabase.co/auth/v1/callback`）。在 Supabase URL Configuration 中配置本地 Site URL 和允许的 `http://localhost:3000/auth/callback`；部署后追加实际域名的 `/auth/callback`。

登录由 Supabase 完成，首次 Google 登录会创建用户。OAuth 成功后进入项目列表。

### 3. 模型

配置支持 Chat Completions、流式响应、工具调用的模型端点：

```dotenv
AI_BASE_URL=https://YOUR_PROVIDER/v1
AI_API_KEY=YOUR_SERVER_ONLY_KEY
AI_MODEL=YOUR_MODEL_ID
```

这些变量只在服务端使用。重启开发服务，创建项目，输入需求发送。Agent 通过 `read_files`、`apply_changes`、`validate_project` 操作候选文件；检查通过后原子保存项目、版本与消息。工具循环最多 8 步，每次请求 100 秒，文件总量上限 300 KB，单文件 100 KB、最多 20 个文件。

## 目录

```text
app/                         页面与服务端接口
  api/projects/              创建、生成、保存、版本和恢复
  auth/callback/             OAuth 回调
  projects/[id]/             已登录工作台
  demo/                      无需账号的交互示例
components/
  home.tsx                   首页与项目列表
  workspace/                 对话、编辑预览、版本 UI
  ui/                        shadcn/ui 组件
lib/
  agent/                     AI SDK 单 Agent 和工具
  projects/                  鉴权、文件边界与源码校验
  supabase/                  浏览器/服务端 Supabase 客户端
  templates/                 版本化 React 模板与示例
  stream.ts                  NDJSON 流解码
supabase/migrations/         PostgreSQL 表、RLS 与事务 RPC
tests/                       按 unit、components、integration、http、e2e 分层
  support/                   共享登录、HTTP 操作和数据库客户端
  fixtures/                  隔离数据库服务与模型替身
scripts/testing/             测试服务启动、云端编排、恢复清理
```

## 技术与取舍

- Next.js App Router + TypeScript，界面使用 Tailwind CSS、shadcn/ui、Lucide。
- Vercel AI SDK ToolLoopAgent，单 Agent 直接操作文件，避免第一版引入多 Agent 调度。
- Supabase 提供 Google OAuth 和托管 PostgreSQL。
- Sandpack/CodeMirror 提供编辑与独立 iframe 预览，固定 React 18 + TypeScript + CSS + lucide-react。平台本身使用 React 19。
- 文件列表只展示用户项目文件，运行入口与依赖清单由平台控制。生成代码不在 Next.js 服务端执行。
- 延伸能力为版本历史：生成和手动保存均生成快照；恢复创建一个新版本，原历史保留；下一轮 Agent 从恢复后的文件继续。
- 通过 revision 与数据库行锁拒绝过期保存；生成失败不覆盖原代码。刷新时查询运行状态，超时释放锁。

## 验证

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

数据库测试使用 PGlite 执行实际 SQL 迁移，并模拟 Supabase auth.uid()/角色，验证用户隔离、直接写入拒绝、版本冲突、生成锁、失败保留文件和恢复事务；它不能替代真实 Supabase OAuth 联调。

浏览器验收：示例待办新增/完成/筛选/删除，代码编辑与预览，桌面/手机切换，版本面板。源码变更后预览会重新初始化，生成应用的临时状态随之重置。真实 Google 登录与 Supabase 项目创建已联调通过；完整生成、编辑保存及恢复流程按下方检查记录确认。

## 部署

将源代码仓库导入 Vercel，框架选择 Next.js，构建命令 `npm run build`。配置上述全部环境变量，将 NEXT_PUBLIC_APP_URL 改为实际 HTTPS 域名，并更新 Supabase/Google 的回调设置，再重新部署。数据库仍由 Supabase 托管。

Agent route 配置 maxDuration=120；所选部署套餐须允许相应执行时长。关闭页面或超时可能中断生成；第一版没有后台任务队列。公共交付前完成一次真实的“登录 → 创建 → 生成 → 编辑保存 → 刷新 → 恢复 → 再生成”验收。

## 当前边界与后续优先级

1. 当前只生成前端应用；持久化覆盖平台项目、消息、源码和版本。生成应用自身的业务数据库不是第一版范围，示例待办仅保存在 React 状态。
2. 生成前检查语法和静态引用，不等同于完整 TypeScript 类型检查或浏览器业务测试。运行错误会在预览中显示。
3. 右侧预览由本机 esbuild 编译，在仅允许脚本的 srcdoc 沙箱中运行；Sandpack 仅保留代码编辑器，不再将源码传到 CodeSandbox 打包服务。预览使用项目安装的 React 19 运行时，限制联网、父页面访问和表单提交。
4. 未实现自动浏览器修复、独立产物发布、GitHub 同步、文件创建/删除的手工 UI、多人协作、账户额度/全局限流、版本差异比较。
5. 下一步优先接通真实服务并部署，其次增加运行错误反馈与修复，再增加导出/发布和账户额度限制。

详细选型见 `MVP_ARCHITECTURE.md`；产品参考记录见 `ATOMS_FEATURES.md`。

## 本次检查记录（2026-10-20）

- lint、TypeScript 检查、生产构建通过。
- 19 项默认自动测试通过，其中 4 项为实际 SQL/RLS 事务测试；另有真实订阅调用测试默认跳过，已单独执行通过。
- 无配置时项目 API 返回明确的 503 配置提示。
- 生产依赖审计为 0 漏洞；开发工具链仍存在上游 braces 相关告警，未采用会降级 Next.js 工具链的强制修复。
- 已创建 Forma Demo Google OAuth 客户端并在 Supabase 启用，真实登录已成功返回 `/projects`，项目创建及刷新读取通过。登录密钥仅配置在 Supabase。尚未部署或提交 GitHub。

## 使用 ChatGPT 订阅（本地开发）

已增加 `codex-local` 后端，通过官方 `codex exec` 调用本机 ChatGPT 登录，不需要 AI_API_KEY。本机 `.env.local` 已配置这个模式和 Codex CLI 路径。确认登录方式可运行 `codex login status`。开发服务默认绑定 localhost，使监听地址与本机订阅访问检查一致。

```dotenv
AGENT_BACKEND=codex-local
CODEX_CLI_PATH=/absolute/path/to/codex
```

此模式只在开发环境、非 Vercel、localhost 请求下启用，且项目接口仍需 Supabase 用户登录。它不把个人订阅转为公开模型服务。CLI 忽略用户自定义配置、使用临时只读工作目录、禁用 shell/浏览器/应用/多 Agent 工具，输入完整项目文件并返回结构化源码；源码检查通过后复用原来的数据库版本事务。实时转发 Codex 的公开进展消息（不展示内部推理），并展示实际接收的文件变更、语法检查、应用编译和保存阶段；消息按段到达，不提供逐 token 文本流。最终 JSON 由本地 schema 和源码检查校验。新应用按组件、hooks 和逻辑模块组织，简单修改不强制拆文件。请求取消会停止子进程。

真实订阅冒烟测试（会消耗少量订阅额度，不包含在默认测试里）：

```sh
FORMA_CODEX_SMOKE=1 npx vitest run tests/integration/local-codex.test.ts
```

2026-10-20 已通过一次真实调用：将 React 标题 `Hello` 修改为 `Forma ready`，返回源码并通过校验。Google 登录、Supabase 数据库初始化及项目创建现已完成；这次独立模型测试不代表完整主流程验收。标准测试现为 19 项通过、1 项真实调用默认跳过。

正式在线部署可继续使用原来的模型 API 后端，或另行集成面向应用的官方 ChatGPT 授权流程；不能仅上传本机配置就获得订阅访问。参考：[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)、[认证方式](https://learn.chatgpt.com/docs/auth)。

### 真实服务联调补充（2026-10-20）

- Google OAuth 创建并配置完成，登录成功返回项目列表。当前 Google 项目处于测试状态，公开评审前需检查目标用户可访问性。
- Supabase 四张业务表与 RPC 已初始化；匿名直接读取被拒绝。
- 浏览器完成创建项目 → 使用 ChatGPT 订阅生成专注计数器 → 自动保存 v1 → 点击计数从 00 变为 01 → 刷新后源码、消息与 v1 保留。
- 修正开发服务监听地址为 localhost，避免订阅模式将 0.0.0.0 请求地址判为非本机。
- 云端手动编辑保存、历史恢复及恢复后再生成仍需完整验收；尚未公开部署。

### 对话行为修复

按顺序执行 migrations 中的全部 SQL，包括 `202610200002_conversation_turns.sql`。该增量迁移已同步到本次 Supabase 项目：没有源码变更的 AI 回合保存回复并完成运行，不创建版本。纯问候直接回复；其他问答交给 Agent，可返回空文件列表；只有实际变更才保存源码快照。默认测试现为 22 项通过、1 项真实模型测试跳过。

本机订阅生成上限已调整为 300 秒，API 模式仍为 100 秒。增量迁移 `202610200003_local_run_timeout.sql` 将新任务数据库有效期设为 310 秒，给版本保存预留时间；超时与主动停止分别提示。

嵌入预览白屏修复：编辑后自动重新编译，显示编译错误和运行错误；支持手机宽度、刷新和分类交互。独立预览仅作为可选入口。

## 回归测试（2026-10-21）

`npm test` 执行默认回归测试；`npm run lint`、`npm run typecheck` 和 `npm run build` 分别检查规范、类型和生产构建。

| 层级 | 覆盖的故障 |
| --- | --- |
| 单元/协议 | 数据库错误分类、问候不触发代码生成、断流不能当成功、中文分片解码、Codex 重连与公开进展 |
| 组件（Testing Library + jsdom） | Enter/Shift+Enter/输入法、立即切换停止按钮、run ID 返回前停止、断流恢复草稿、登录弹窗、Google 选账号、退出失败可重试 |
| 接口（真实路由，替换模型和数据库连接） | 进展先于完成、保存失败不能发 done、清理锁重试、编译失败拒绝保存、超时轮询、停止先撤销提交权限再中断模型 |
| 数据库集成（PGlite，执行项目 SQL） | 事务回滚、版本冲突、用户隔离、失败解锁、取消后迟到结果拒绝提交、旧任务重复清理不解锁新任务 |
| 浏览器端到端（Playwright） | 真实页面 → 路由 → 本地 SQL/RPC → 编译 → 内嵌预览；认证和模型用可控替身，注入失败和长任务 |

自动化端到端现已使用 Playwright Chromium，可独立运行且不需要登录真实 Google 或 Supabase：

```bash
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report
```

`playwright.config.ts` 自动启动/关闭 3001 测试服务和 54329 本地测试后端；端口被占用会失败，不复用可能配置错误的服务。`tests/e2e/core.spec.ts`、`tests/e2e/recovery.spec.ts` 和 `tests/e2e/auth.spec.ts` 共 15 条核心用户流程测试（含下方 OAuth 回调测试）：

| 核心功能 | 浏览器断言 |
| --- | --- |
| 未登录访问 | 创建弹登录框、关闭保留草稿、项目页跳转登录、接口拒绝匿名访问、示例可浏览 |
| Google 登录入口 | 点击登录发出 `select_account`、正确回调地址、跳转前后的草稿保留（拦截第三方入口） |
| 项目生命周期 | 创建、列表出现、重新进入、刷新后消息与版本保留 |
| 聊天输入 | Enter 发送、Shift+Enter 换行、问候有引导且不创建空版本 |
| 生成与多文件 | 完成前可见进展、文件树展示组件、切换文件查看源码、生成后继续聊天 |
| 手动代码编辑 | 真实 CodeMirror 输入、预览即时更新、脏状态阻止生成、保存及刷新持久化 |
| 版本管理 | 查看旧版本只读、返回当前版本、恢复产生新版本并保留旧历史 |
| 预览错误恢复 | 语法错误可见、拒绝保存错误版本、修正后恢复预览、独立预览可打开 |
| 权限隔离 | 第二用户不能读取、保存或打开第一用户项目，原版本不变 |
| 退出登录 | 退出回到访客态，旧项目页及接口重新要求认证 |
| 多标签页冲突 | 旧页保存遭拒绝、保留旧页草稿、不覆盖最新云端版本 |
| 故障和取消 | 生成失败可重试、停止可重发、输入框解锁、右侧预览可点击、手机宽度和刷新正常 |

这些测试不代表穷举所有边界条件；输入法组合键、run ID 返回前停止、任务超时回收及迟到提交等边界另由组件/接口/SQL 测试覆盖。

模型和认证使用测试替身；本地 HTTP 后端用 PGlite 执行所有正式迁移及 RPC，页面、应用接口、SQL 事务和预览编译均执行实际代码。每次运行创建临时内存数据库，退出后销毁，不读取云端数据，不消耗模型额度。这不覆盖真实 Google OAuth、Supabase 网络可用性或外部模型质量；这些仍需单独冒烟验证。

失败时自动保存 `test-results/` 中的截图和 trace；HTML 报告位于 `playwright-report/`。GitHub Actions 的 `.github/workflows/test.yml` 运行自动测试、Playwright 和生产构建，并上传报告。CI 不需要任何云端凭据。

需要手动复现时，`npm run test:e2e:serve` 启动同样的隔离服务。测试登录通过 Playwright fixture 完成；`E2E_FAIL` 注入连接失败，`E2E_SLOW` 等待停止，`E2E_SUCCESS` 返回可点击计数器。历史人工端到端证据仍在 `docs/e2e-failure-recovered.png`、`docs/e2e-stopped.png`、`docs/e2e-preview.png`。

真实 Codex 两项冒烟测试需显式设置 `FORMA_CODEX_SMOKE=1` 或 `FORMA_CODEX_PROGRESS_SMOKE=1`，会使用订阅额度。默认跳过，避免外部网络和模型波动影响确定性回归；可控模型端到端不证明外部模型服务始终可用。

### OAuth 回调自动化与发布前手动验收

`tests/e2e/auth.spec.ts` 从未登录浏览器点击 Google 登录开始，经本地授权服务替身返回一次性 code，再由真实 `/auth/callback` 和 Supabase SDK 完成 PKCE code/verifier 交换、写入 Cookie、跳转项目页。覆盖刷新后的会话、草稿恢复、退出后旧 code 重放失败、无效 code、取消授权和失败后再次登录。`tests/integration/auth-callback.test.ts` 额外覆盖交换返回错误及抛出网络异常。替身验证 PKCE 和 code 一次性使用，但不验证 Google 本身的身份认证。

每次发布，以及修改 Google/Supabase 配置、域名或回调地址后，由发布者在目标部署地址手动执行：

- [ ] 用未登录窗口输入一段需求，点击创建，确认弹出登录窗口且内容不丢失。
- [ ] 点击 Google 登录，确认进入 Google 官方账号选择页。选择账号 A 并完成授权，返回目标网站项目页，无回调错误。
- [ ] 确认登录前需求恢复；创建项目，刷新页面后仍保持登录，自己的项目可重新打开。
- [ ] 退出登录，确认项目接口/页面不能继续访问；再次登录时能选择“使用其他账号”。
- [ ] 使用账号 B 登录，确认看不到账号 A 的项目，直接打开 A 的项目地址也无权访问。
- [ ] 在新窗口发起登录并取消/拒绝授权，确认返回可重试的登录界面，重新登录可成功。若 Google 返回自身页面，回到应用后仍应可以重新发起登录。
- [ ] 记录部署地址、版本、浏览器、测试时间和结果；任何一项失败先阻止发布，修复后重测。不记录密码、验证码、Cookie 或授权 code。

验证码、二次验证和 Google 风控由人工完成；不要把个人登录态或长期凭据上传 CI。默认 CI 只运行隔离的授权替身测试。

### 真实 HTTP 接口回归

`npm run test:http` 运行 `tests/http/` 中按功能拆分的 HTTP 用例（隔离环境 24 条，另有 3 条仅云端运行）。`npm run test:e2e` 和 CI 默认运行全部 Playwright 用例（15 条浏览器流程 + 24 条 HTTP）。HTTP 测试使用 Playwright APIRequestContext，通过本地 TCP/HTTP 访问实际 Next.js 服务，不直接调用路由函数。

覆盖项目创建/列表/详情/改名、源码保存、聊天流、运行状态/停止、版本列表/详情/恢复、独立预览及公共预览编译接口：

- 参数：名称空白/过长/错误类型、JSON 语法、请求大小、revision 类型/范围、UUID、prompt、源码/引用/受保护路径、null 预览请求。
- 权限：匿名访问全部私有读写接口、第二账号跨项目读写/生成/停止/恢复/预览、同账号串用不同项目的版本和运行 ID；失败后原数据不变。
- 异常：模型失败、提交连接异常、缺少数据库函数；区分 HTTP 错误状态与流式 HTTP 200 中的终止 error 事件，验证不发 done、不创建伪成功版本、任务锁释放和后续重试。
- 冲突：两个并发保存恰好一个成功/一个 409；两个并发生成只分配一个任务；运行中拒绝手动保存；重复请求 key、重复停止、停止后重试。
- 持久化：检查版本数量、消息数量、最终源码、锁状态，避免只断言状态码。

隔离环境仍使用测试认证/模型和 Supabase HTTP 适配层；SQL 执行项目真实迁移与 RPC。并发请求是真正并发发出的，但 PGlite 会串行调度数据库操作，因此这不是生产 PostgreSQL 的锁竞争/死锁或负载测试，也不验证真实 Supabase/PostgREST 的全部协议行为。发布验收仍需真实环境冒烟。

### 真实云端 HTTP 集成测试

`npm run test:http:cloud` 使用当前 `forma-demo` 云端 Supabase，启动独立的 localhost:3001 应用服务，不使用本地数据库适配器。普通接口请求使用两个临时账号的真实 Auth 会话，经真实 PostgREST、RLS 和 PostgreSQL RPC 执行。模型仍使用确定性替身，以稳定触发生成成功、失败和停止。

本地 `.env.cloud-test` 配置 `CLOUD_TEST_EXPECTED_HOST`（明确允许测试的 Supabase 主机名）和 `SUPABASE_SERVICE_ROLE_KEY`（已有服务端密钥；文件已忽略提交）。管理密钥只在测试编排进程中使用，不传入应用服务或 Playwright。账号使用随机密码和唯一运行标记；清理严格按本次创建的用户 ID 并验证标记，删除账号时级联清理其项目、消息、版本、任务。最终检查测试数据为零，以及四张业务表的原有记录哈希完全一致。清理失败或原数据变化均令命令失败，不能报告成功。

云端覆盖全部现有 API 路由的正常流程及主要参数、越权、失败恢复、并发冲突，并额外直接测试 PostgREST RLS、RPC 越权、保存与恢复竞争、停止与数据库提交竞争、过期提交不能覆盖新版本。模拟数据库断网/缺失函数的 3 个破坏性故障用例仅在隔离测试中运行，不修改云端表结构、策略或服务配置。OAuth 回调仍由认证套件覆盖；真实 Google 授权保留发布前人工回归。

运行记录保存在忽略提交的 `cloud-test-results/`，含确切测试账号/项目 ID 和清理结果，不含密钥或密码。普通失败和终止信号进入 finally 清理；强制杀进程或机器断电可能阻断清理，应依据该次记录核对账号标记后清理，不能按项目名称批量删除。此命令不加入默认 CI，避免未明确配置时访问云端。

云端测试通过独立进程启动；本机网络曾出现 `UND_ERR_SOCKET` / `ECONNRESET`。可在 `.env.cloud-test` 设置 `CLOUD_TEST_PROXY` 使用已有代理（本机为 `http://127.0.0.1:7890`），localhost 始终绕过代理。套件关闭连接复用，不自动重试接口写请求、不放宽断言；并发请求仍通过不同连接同时抵达云端。默认应用服务的连接配置不受影响。

中断后可执行 `npm run test:http:cloud:cleanup -- cloud-test-results/cloud-<运行ID>.json` 恢复清理：只删除记录内且运行标记一致的账号；已删除账号允许跳过；只读核验遇到网络失败最多重试 5 次。最后验证所有关联数据为零，并核对非测试数据哈希。恢复脚本本身失败时必须保留记录继续处理，不能认为已经清理完成。

| 路由 | 核心验证 |
| --- | --- |
| GET/POST `/api/projects` | 列表、创建、名称/请求体校验、未登录、账号隔离 |
| GET/PATCH `/api/projects/[id]` | 读取、改名、参数校验、越权、持久化 |
| POST `.../save` | 源码/版本校验、越权、保存竞争、生成占用 |
| POST `.../chat` | 输入校验、成功/失败恢复、重复请求、并发互斥、来源限制 |
| GET/POST `.../runs/[runId]` | 查询、停止、重复停止、跨项目隔离、停止与提交竞争 |
| GET `.../versions`、GET `.../versions/[versionId]` | 历史和源码读取、越权、跨项目 ID |
| POST `.../restore` | 恢复、参数校验、越权、恢复与保存竞争 |
| GET `.../preview`、POST `/api/preview` | HTML/CSP、源码编译、非法输入、大小限制、私有预览权限 |
| GET `/auth/callback` | 独立认证套件验证 PKCE/失败/取消；云端套件不模拟真实 Google 同意页 |


### 测试目录与入口

- `tests/unit/`：源码边界、消息流解码、对话判断、Agent 工具逻辑。
- `tests/components/`：首页、工作区的组件交互。
- `tests/integration/`：路由处理、数据库事务、预览编译、Codex 进程集成；路由测试在此层使用边界替身，真实 HTTP 请求位于下一层。
- `tests/http/`：项目生命周期、参数校验、权限、生成、版本、预览、数据库故障分别维护；`database-permissions` 和 `database-concurrency` 验证真实云端数据库行为。
- `tests/e2e/`：浏览器用户流程、OAuth 回调、失败与停止恢复。
- `tests/support/`：共享认证 fixture、HTTP 操作、云端普通用户数据库客户端，不放测试用例。
- `tests/fixtures/`：模型进程替身与隔离 Supabase 适配器。
- `scripts/testing/`：启动服务、云端测试编排、网络配置、按运行记录恢复清理。

现有命令保持兼容：`npm test` 运行 Vitest；`npm run test:e2e` 运行隔离环境的浏览器和 HTTP 套件；`npm run test:http` 只跑隔离 HTTP；`npm run test:http:cloud` 自动创建专用账号并通过 `playwright.cloud.config.ts` 跑云端 HTTP，最后清理。直接运行云端配置缺少测试账号时会失败，避免绕过编排。运行记录、报告和密钥继续忽略提交。

## 临时个人演示（本机 Codex + HTTPS 隧道）

此模式用于受邀账号的临时演示，模型运行在已登录 Codex 的本机。它依赖本机在线和订阅可用额度，不能替代稳定的模型 API 部署；Vercel 不运行本机 CLI。

1. 安装依赖并 `npm run build`，保持 `.env.local` 中的 Supabase 配置与本机 Codex 登录有效。
2. `cloudflared tunnel --url http://localhost:3002 --protocol http2`，取得临时 HTTPS 域名。
3. 新建被 Git 忽略的 `.env.demo`：

```dotenv
FORMA_DEMO=1
DEMO_ORIGIN=https://你的临时域名
# 如本机访问 Supabase 需要代理，可选配置：
# DEMO_PROXY=http://127.0.0.1:7890
```

4. 在 Supabase Auth Redirect URLs 添加精确的 `https://你的临时域名/auth/callback`，保留原有回调。
5. `npm run demo:serve`，使用自己的 Google 账号登录临时地址。所有登录账号均可体验，接口仍校验登录与项目所有权，生成校验精确来源，Codex 同时只运行一个任务。

停止演示时关闭应用与隧道，并移除 Supabase 中对应临时回调。重开隧道若域名变化，更新 `.env.demo` 和回调后重启应用。不要提交 `.env.demo`、数据库管理密钥或 Codex 登录凭据。临时隧道没有可用性保证，长任务和流式传输应每次实际验证；正式交付使用模型 API 与稳定部署。

演示访问方式与 Google OAuth 配置详见 [演示账号配置](docs/DEMO_ACCESS.md)。

### 已配置固定域名的一键启动

当前入口：https://forma.coder-cengdong.site

`npm run demo:start` 后台启动应用和固定隧道，`npm run demo:stop` 一起停止，`npm run demo:status` 查看状态。macOS 可双击根目录的 `启动演示.command` / `停止演示.command`。首次配置和日志位置见 [固定域名说明](docs/DEMO_ACCESS.md#固定域名与重启)。代码更新后先 `npm run demo:stop`，再构建并重新启动。电脑需保持在线。
