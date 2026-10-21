# 面试演示访问方式

所有通过 Google 登录的账号均可创建和生成自己的项目，无需预先配置邮箱或用户 ID。未登录请求仍返回 401，其他人的项目仍由所有权检查与数据库 RLS 隔离。

`.env.demo` 只需设置 `FORMA_DEMO=1` 与当前 HTTPS `DEMO_ORIGIN`（可选 `DEMO_PROXY`）。不再读取 `DEMO_ALLOWED_EMAILS` 或 `DEMO_ALLOWED_USER_IDS`。

所有账号共用本机模型额度，最多同时运行一个 Codex 任务；本机生成超时上限为 600 秒，API 模式为 100 秒。演示结束关闭应用与隧道，并删除 Supabase 中失效的临时回调地址。

## Google OAuth 检查

2026-10-21 控制台实查：当前使用客户端 **Forma Demo**，所属 Google Cloud 项目显示名为 **multica-google-auth**。已核对 Google 重定向 URI 与现有 Supabase `/auth/v1/callback` 一致。受众为 **外部**，发布状态为 **测试**，测试用户列表为 **0 人**。不要仅按项目显示名寻找 Forma，以客户端名称和 Supabase Google provider 中的 Client ID 核对。

当前登录请求仅使用 `email profile` 基础身份权限。Google 官方说明：仅请求姓名、邮箱、用户资料（openid/email/profile）的登录适用例外，不要求用户必须在 Google 测试用户列表中。因此本项目目前只需完成正常登录，不需要为基本登录发布 OAuth 应用，也不需要增加额外权限。

官方依据：[Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)。若以后增加 Drive、Gmail 等权限，需重新检查测试用户限制、验证要求及企业管理员策略，不能沿用基础登录例外。

如需维护 Google 侧测试名单：Google Cloud → 选择对应项目 → Google Auth Platform → 目标对象 / Audience → 测试用户 → 添加用户 → 输入 Google 账号邮箱 → 保存。当前 Forma 不维护应用账号白名单。实际邮箱尚未提供时，不添加示例地址。

## 回调地址的两层区别

- Google OAuth 客户端「已获授权的重定向 URI」填 Supabase provider 提供的 `https://你的项目.supabase.co/auth/v1/callback`。
- Supabase Authentication → URL Configuration → Redirect URLs 填 `https://当前演示域名/auth/callback`。保留仍使用的 localhost 回调。
- 更换临时隧道域名时，更新 Supabase Redirect URLs 和 `.env.demo` 的 `DEMO_ORIGIN`，重启应用。Google 的 Supabase 回调无需随隧道域名变化。

## 交付前验收

1. 使用 Google 账号首次登录，确认能创建项目和生成作品。
2. 未登录调用私有接口返回 401；账号 A 不能读取、修改或预览账号 B 的项目。
3. 验证停止后可重新发送，生成失败后可恢复，右侧预览可交互。
4. 验证同时第二个模型任务被拒绝，超时后释放运行名额。
5. 展示期间保持本机、应用、代理（如使用）和隧道在线。链接持有者登录后都能使用模型额度；结束展示即关闭隧道。

自动化覆盖登录鉴权、项目隔离、并发拒绝、超时信号后的名额释放及重新运行。真实第三方登录需目标账号完成一次验收。

## 固定域名与重启

当前演示入口：https://forma.coder-cengdong.site

使用 Cloudflare 命名隧道 `forma-demo`，转发到本机 `http://localhost:3002`。域名与隧道不会随进程重启变化。凭据保存在本机 `~/.cloudflared/forma-demo.token`，权限 600，不在仓库中。

重启后，在项目目录执行一次即可后台启动应用与固定隧道，终端可关闭：

```sh
npm run demo:start
npm run demo:status  # 查看运行状态
npm run demo:stop    # 一起停止应用和隧道
```

代码有更新时先执行 `npm run build`。`.env.demo` 的 `DEMO_ORIGIN` 设为 `https://forma.coder-cengdong.site`。Supabase Site URL 使用同一固定地址，Redirect URLs 包含其 `/auth/callback`。Google OAuth 客户端仍回调 Supabase，无需修改。

macOS 也可双击仓库根目录的 `启动演示.command` 或 `停止演示.command`。日志位于被 Git 忽略的 `.demo/`，启动失败时查看 `manager.log`、`app.log` 和 `tunnel.log`。重复启动不会创建第二份进程，任一子进程退出会关闭另一项服务。

结束演示时执行 `npm run demo:stop`。电脑关机或服务停止时网站暂不可用；重新运行以上命令后原链接恢复，无需重新发链接。当前没有设置开机自动运行。
