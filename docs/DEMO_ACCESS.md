# 面试演示访问方式

所有通过 Google 登录的账号均可创建和生成自己的项目，无需预先配置邮箱或用户 ID。未登录请求仍返回 401，其他人的项目仍由所有权检查与数据库 RLS 隔离。

当前部署：Vercel `bom1`（孟买）承载页面、鉴权、数据库访问与编译；Supabase 位于 `ap-south-1`（孟买）。本机 Worker 主动访问云端领取任务，不需要入站端口或 Cloudflare 隧道。Cloudflare 仅管理固定域名 DNS，目标为 Vercel。

所有账号共用一个 Codex 执行名额，生成上限 600 秒，数据库任务有效期 630 秒。关闭 Worker 后网站仍可浏览和编辑；新生成返回“生成服务暂未在线”。已有任务在 Worker 正常停止时失败并保留原版本；进程崩溃或断网时到期释放。

## Google OAuth 检查

2026-10-21 控制台实查：当前使用客户端 **Forma Demo**，所属 Google Cloud 项目显示名为 **multica-google-auth**。已核对 Google 重定向 URI 与现有 Supabase `/auth/v1/callback` 一致。受众为 **外部**，发布状态为 **测试**，测试用户列表为 **0 人**。不要仅按项目显示名寻找 Forma，以客户端名称和 Supabase Google provider 中的 Client ID 核对。

当前登录请求仅使用 `email profile` 基础身份权限。Google 官方说明：仅请求姓名、邮箱、用户资料（openid/email/profile）的登录适用例外，不要求用户必须在 Google 测试用户列表中。因此本项目目前只需完成正常登录，不需要为基本登录发布 OAuth 应用，也不需要增加额外权限。

官方依据：[Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)。若以后增加 Drive、Gmail 等权限，需重新检查测试用户限制、验证要求及企业管理员策略，不能沿用基础登录例外。

如需维护 Google 侧测试名单：Google Cloud → 选择对应项目 → Google Auth Platform → 目标对象 / Audience → 测试用户 → 添加用户 → 输入 Google 账号邮箱 → 保存。当前 Forma 不维护应用账号白名单。实际邮箱尚未提供时，不添加示例地址。

## 回调地址的两层区别

- Google OAuth 客户端「已获授权的重定向 URI」填 Supabase provider 提供的 `https://你的项目.supabase.co/auth/v1/callback`。
- Supabase Authentication → URL Configuration → Redirect URLs 填 `https://当前演示域名/auth/callback`。保留仍使用的 localhost 回调。
- 当前云端固定域名无需隧道回调。只有回退到旧隧道方案且更换域名时，才需更新 Supabase Redirect URLs 与旧配置的 DEMO_ORIGIN。

## 交付前验收

1. 使用 Google 账号首次登录，确认能创建项目和生成作品。
2. 未登录调用私有接口返回 401；账号 A 不能读取、修改或预览账号 B 的项目。
3. 验证停止后可重新发送，生成失败后可恢复，右侧预览可交互。
4. 验证同时第二个模型任务被拒绝，超时后释放运行名额。
5. 展示生成能力时保持本机 Worker 与 Codex 连接在线；结束展示停止 Worker，云端网站继续提供项目浏览、编辑和预览。

自动化覆盖登录鉴权、项目隔离、并发拒绝、超时信号后的名额释放及重新运行。真实第三方登录需目标账号完成一次验收。

## 固定域名与启停

演示入口：https://forma.coder-cengdong.site

Vercel 项目为 `forma-demo`，生产别名为 `https://forma-demo-ochre.vercel.app`。DNS 的 `forma` CNAME 指向 Vercel 提供的地址，当前为 `86160cfcb150455d.vercel-dns-017.com`（DNS only）。Google 回调仍指向 Supabase；Supabase Site URL 与允许回调仍为固定域名，无需因后端迁移修改 OAuth 客户端。

本机 `.env.worker`（不要提交）：

```dotenv
WORKER_APP_ORIGIN=https://forma-demo-ochre.vercel.app
CODEX_WORKER_SECRET=与云端相同的随机密钥
CODEX_CLI_PATH=/absolute/path/to/codex
```

云端同名密钥与数据库管理密钥仅用于服务端。Worker 不持有数据库管理密钥，不接受外部请求。源码与上下文通过 HTTPS 传送到本机；不在日志中记录源码、用户提示或密钥。

```sh
npm run worker:start
npm run worker:status
npm run worker:stop
```

当前演示机器已有 `.demo/cloud-mode`，`npm run demo:start`、`demo:stop`、`demo:status` 和根目录双击启停脚本转为控制 Worker。日志为 `.demo/worker.log` 和 `.demo/worker-manager.log`。Worker 代码更新后停止再启动；云端 `main` 自动部署不会替你更新或重启本机进程。

## 发布与回退

推送 `main` 后 Vercel 自动构建部署；GitHub Actions 是独立测试，不会阻止 Vercel 提前发布。迁移 SQL 须先执行。上线前运行测试文档中的云端任务和性能回归，Google 同意页由目标账号手动验收。

旧命名隧道和配置保留作回退。需要回退时先停止 Worker、移除本机 `.demo/cloud-mode` 标记，使用迁移前稳定提交构建并启动旧演示；将 DNS 恢复为原 Tunnel CNAME（`075e1d40-934e-4b2a-956a-8207c5c332a8.cfargotunnel.com`，Proxied）。新 SQL 迁移为附加表/函数，不修改旧模式的事务流程。回退前确认没有进行中的生成，避免两个后端同时使用本机 Codex。
