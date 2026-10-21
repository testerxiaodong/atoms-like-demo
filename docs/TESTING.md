# 发布前测试与真实服务回归

日常 CI 运行隔离环境回归；发布前补跑真实 Codex 与云端数据库检查。默认跳过的 5 项需要外部服务凭据，不能把 CI 通过等同于这 5 项也通过。以下命令均在仓库根目录运行。

## 日常 CI

```sh
npm ci
npm run lint
npm run typecheck
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
```

截至 2026-10-21，默认 Vitest 为 60 项通过、2 项跳过，Playwright 浏览器与 HTTP 套件为 39 项通过、3 项跳过。[已通过的 CI](https://github.com/testerxiaodong/atoms-like-demo/actions/runs/39555947348) 对应提交 `0c90fe5`。后续新增测试时数量会变化，应以当次报告为准。

## 默认跳过的 5 项

| 测试 | 文件 | 验证内容 | 启用条件与跳过原因 |
| --- | --- | --- | --- |
| 真实 Codex 最小生成 | `tests/integration/local-codex.test.ts` | 将标题 Hello 修改为 Forma ready | `FORMA_CODEX_SMOKE=1`；需要已登录的 Codex CLI，使用订阅额度，依赖网络和模型响应 |
| 真实 Codex 进度与多文件生成 | 同上 | 生成秒表，至少 4 个源码文件，源码输出前有进度消息，产物通过预览构建 | `FORMA_CODEX_PROGRESS_SMOKE=1`；依赖同一真实模型服务，耗时更长 |
| 云端保存与恢复并发 | `tests/http/database-concurrency.spec.ts` | 同一版本并发操作只有一个成功，另一个返回 409，版本与消息数量正确 | 通过云端测试编排设置 `CLOUD_TEST_URL`；默认 CI 使用隔离数据库 |
| 云端停止与完成并发 | 同上 | 停止和完成竞争时状态一致；迟到的生成结果不能覆盖后续保存 | 同上；需要真实 PostgreSQL RPC 与事务行为 |
| 云端数据库权限隔离 | `tests/http/database-permissions.spec.ts` | 跨账号读取不可见，越权 RPC 被拒绝，直接写入不能绕过接口约束 | 同上；需要真实 Auth、PostgREST、RLS 与普通用户会话 |

默认 CI 不配置个人 ChatGPT 登录凭据或云端数据库管理密钥，避免每次提交消耗订阅额度、修改共享云端环境，或受外部网络波动影响。隔离测试继续覆盖应用逻辑，但不能替代这 5 项真实服务验收。

## 运行真实 Codex 测试

前置条件：本机 `codex` 命令可用，已用自己的 ChatGPT 账号登录，网络可访问模型服务。测试直接调用 CLI，不需要启动网页应用；不会在业务数据库创建项目。不要在 CI 或仓库中上传 Codex 登录凭据。

```sh
FORMA_CODEX_SMOKE=1 FORMA_CODEX_PROGRESS_SMOKE=1 \
  npx vitest run tests/integration/local-codex.test.ts
```

该文件还包含 3 项普通断言，因此预期结果是 **5 passed、0 skipped**，其中真实模型检查为 2 项。两项测试的超时分别为 90 秒和 290 秒；超时或网络错误应排查后重跑，不能当作通过。需要指定 CLI 时可显式设置 `CODEX_CLI_PATH`；这个直接运行命令不会自动读取 `.env.local`。

多文件测试验证进度事件和预览构建，不等同于在浏览器中实际操作秒表；右侧预览交互另由浏览器回归与发布验收覆盖。

## 运行 3 项真实云端数据库测试

前置条件：

- `.env.local` 中配置目标 Supabase 的 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，已执行所需数据库迁移。
- 被 Git 忽略的 `.env.cloud-test` 中配置 `CLOUD_TEST_EXPECTED_HOST` 和 `SUPABASE_SERVICE_ROLE_KEY`。需要代理时设置 `CLOUD_TEST_PROXY`。不要把密钥写进命令、测试报告或提交记录。
- localhost:3001 可用。编排脚本会启动独立测试应用，不复用演示服务。
- 测试期间暂停对同一数据库的人工修改；清理阶段会对原有数据做前后哈希核对，其他用户正常写入也会使“原数据未变”检查失败。

只补跑这 3 项：

```sh
npm run test:http:cloud -- --grep 'cloud '
```

当前这 3 项的标题均包含 `cloud `，预期为 **3 passed**。不要直接设置 `CLOUD_TEST_URL` 绕过编排：编排负责创建测试账号、限制目标数据库并清理数据。

发布涉及接口、迁移或权限变更时，建议运行完整云端 HTTP 套件：

```sh
npm run test:http:cloud
```

云端套件使用真实 Auth、PostgREST 和 PostgreSQL；模型采用确定性替身。真实模型由上一节独立验证。

### 清理与失败恢复

编排创建两个专用临时账号，所有测试项目归属于它们。管理密钥仅用于准备和清理，不传给应用或 Playwright。清理严格按本次用户 ID 和运行标记执行，不按名称批量删除。

测试断言通过后，还必须确认命令退出码为 0，且输出 `Cleanup verified`。本地 `cloud-test-results/cloud-<运行ID>.json` 应包含 `status: "passed"` 和已验证清理的 `cleanup` 字段，确认：

- 本次测试账号已不存在；测试项目及其版本、消息、运行记录均无残留。
- `projects`、`versions`、`messages`、`runs` 四张表原有记录哈希与测试前一致。

断电、强制终止或清理失败时，保留该次运行记录并执行：

```sh
npm run test:http:cloud:cleanup -- cloud-test-results/cloud-<运行ID>.json
```

替换为本次实际记录路径。恢复清理成功不代表测试断言通过；仍需检查原测试结果。运行记录包含内部账号和项目 ID，继续留在被 Git 忽略的目录，不上传公开仓库。

## 2026-10-21 补跑记录

代码版本：`0c90fe5`；环境：本机现有 ChatGPT 登录与当前云端 Supabase，使用上述两条定向命令。

| 检查 | 结果 |
| --- | --- |
| 真实 Codex 最小生成 | 通过 |
| 真实 Codex 进度与多文件生成 | 通过 |
| Codex 测试文件整体 | 5 passed，0 skipped，耗时 161.36 秒；包含 3 项普通断言 |
| 云端保存与恢复并发 | 通过 |
| 云端停止与完成并发 | 通过 |
| 云端数据库权限隔离 | 通过 |
| 云端定向套件整体 | 3 passed，0 skipped，耗时约 2.2 分钟 |
| 清理核验 | 2 个测试账号、5 个测试项目及关联数据已清理，四张表原有数据未变 |

这次补跑覆盖默认跳过的全部 5 项，不是重新运行整个云端 HTTP 套件。两条命令均以退出码 0 完成。

## 发布前回归清单

1. 确认待发布提交的默认 CI 通过。
2. 在真实服务环境运行上述 5 项，并确认云端清理核验成功；记录日期、提交、通过数量和异常。
3. 涉及接口、迁移或权限变更时，再运行完整云端 HTTP 套件。
4. 在最终访问域名手动验证 Google 登录、退出和换号，以及创建项目、生成、停止后重发、失败恢复和右侧预览交互。自动化不代替真实 Google 授权与最终域名回调验收。

演示启动方式和 OAuth 回调配置见 [演示访问说明](DEMO_ACCESS.md)。

## 首页与登录流程回归

`tests/e2e/onboarding.spec.ts` 覆盖首页直接生成、刷新与重新访问不重复发送、注册后自动续接、授权失败重试、自动生成失败恢复、自动任务停止后重发、4 个示例交互、示例源码复制和未知示例拒绝，以及移动端横向溢出检查。

`tests/components/home.test.tsx` 覆盖重复点击只创建一次、创建失败保留草稿、登录注册的 Google 选账号参数；`tests/components/workspace.test.tsx` 验证 React StrictMode 下只消费一次待执行任务，以及已有活跃任务不自动重发。OAuth 回调单独验证允许的本地跳转和拒绝外部重定向。

这组浏览器 OAuth 回归使用隔离认证服务，验证应用衔接；正式发布仍需按上面的清单验证真实 Google 授权。
