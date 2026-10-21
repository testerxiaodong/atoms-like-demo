# Atoms 功能调研与 Demo 范围参考

记录日期：2026 年 10 月 20 日（历史调研）

2026-10-21 核对：本文描述参考产品，不代表 Forma 已实现这些能力，也不是实时产品审计。当前交付范围见 [交付说明](docs/DELIVERY.md)。

产品入口：https://atoms.dev/zh

Atoms 支持通过自然语言和 AI 智能体创建应用，并在同一项目中预览、修改、管理版本和发布。本记录用于明确其主要能力，为 Atoms Demo 的功能取舍提供依据。

**证据范围：以下功能来自已读取的 Atoms 官方帮助文档。记录形成时未完成产品页面实际登录测试；本文不代表所有功能在当前账号、套餐或项目类型中均可使用。**

## 核心使用流程

输入需求与参考素材 → 创建项目 → 智能体澄清或规划 → 编写代码并展示执行过程 → 预览并测试应用 → 对话或手动修改 → 形成新版本 → 发布 → 验证线上版本。

预览中的最新修改需要通过 Update 更新到已发布网站。项目分享与成品网站发布是两个不同入口。

来源：[Quick Start](https://help.atoms.dev/en/articles/12129545-quick-start)、[Publish your project](https://help.atoms.dev/en/articles/12129577-publish-your-project)。

## 功能清单

| 模块 | 官方文档描述的能力 | 使用价值 |
| --- | --- | --- |
| 首页与项目管理 | 中央输入框创建项目；添加文件、文件夹和图片参考；My Projects 重新打开项目；切换工作空间；模板、Discover 和额度入口 | 从想法开始并持续管理多个项目 |
| 对话生成 | 输入自然语言需求；继续提出修改；展示智能体身份、活动步骤和工具操作；完成后输出变更总结及版本卡片 | 让用户跟踪生成过程并迭代应用 |
| 任务控制 | 排队后续消息；调整队列；停止当前任务；补充信息后继续；部分队列操作随工作流可用性变化 | 管理连续需求与执行中的调整 |
| 智能体协作 | 关闭 Team Mode 时由 Alex 处理；开启后可由 Mike 协调多个专业角色；支持 @ 智能体、澄清问题、计划审批与任务交接 | 支持多阶段任务分工 |
| App Viewer | 操作真实应用；桌面与手机预览；刷新、返回首页、选择页面、独立窗口和 Console | 在平台内验证生成结果 |
| Design | Theme 配置全局样式；Visual Editor 修改选中元素；Library 替换、上传或生成图片 | 用可视化方式调整界面 |
| 代码与文件 | 文件树、按文件名搜索、代码编辑、修改预览、提交或丢弃编辑、Diff、文件引用到对话、文件管理与 ZIP 导出 | 检查源码并继续开发 |
| 版本历史 | 查看生成版本；按可用性预览旧版本；Restore 恢复版本；Remix 从旧版本创建独立项目 | 保留可用结果并尝试不同方向 |
| 问题恢复 | Issue Report 展示错误信息；查看日志；Resolve 请求 AI 分析并尝试修复 | 将发现问题与修复接入生成流程 |
| Atoms Cloud | 数据库、用户认证、文件存储、密钥管理、应用内 AI 能力 | 支撑需要用户和持久化数据的应用 |
| 外部连接器 | 连接外部服务作为上下文、执行其支持的操作，或为应用接入服务；文档列有 GitHub、Supabase、GA4、Search Console、Google Ads 等 | 连接代码、数据与运营工具 |
| 分享 | 项目链接、Public/Private 可见性、Discover 展示、App Card 和导出；部分设置受套餐限制 | 分享项目与交付源文件 |
| 发布 | 创建托管网站地址、更新线上版本、连接自定义域名、下线 | 让生成结果成为可访问的网站 |
| 运营分析 | 接入 GA4 查看用户、会话、来源、地区、浏览器、设备和页面表现；Marketing 提供 SEO 与 Ads 相关入口 | 跟踪发布后的使用情况 |

## 关键交互细节

### 智能体协作

文档列出的角色包括：

| 名称 | 角色 |
| --- | --- |
| Mike | 团队负责人，负责规划和协调 |
| Emma | 产品经理，负责需求和优先级 |
| Bob | 架构师，负责系统结构与技术约束 |
| Alex | 工程师，负责编码、修改与测试 |
| David | 数据分析师 |
| Iris | 深度研究员 |
| Sarah | SEO 专家 |
| Adrian | 广告专家 |

角色可用性取决于项目和工作流。例如 Deep Research 使用 Iris，部分角色只在支持的项目中出现。用户可以看到问题卡、计划卡、执行过程和版本卡。

来源：[Working with Agents](https://help.atoms.dev/en/articles/12129548-working-with-agents)。

### 对话和结果预览

生成过程中可展开活动卡，查看文件读取、代码写入、命令执行等工具操作。结束后通过版本卡进入结果预览，并用后续对话提出增量修改。

App Viewer 提供页面导航、手机预览和日志入口。Issue Report 的 Resolve 会发起修复尝试，修复结果仍需验证。

来源：[Project Chat](https://help.atoms.dev/en/articles/12129550-project-chat)、[App Viewer](https://help.atoms.dev/en/articles/12129554-app-viewer)。

### 可视化设计

- Theme：配置颜色、字体、圆角和阴影；可以保存并导入导出主题。
- Visual Editor：选中元素后调整文字、字体、间距、背景、透明度和圆角等属性；可保存或丢弃修改。
- Library：对选中元素使用素材、生成图片或上传图片。
- 可以选中元素后描述修改需求，让智能体针对该元素处理。

全局主题主要影响共享样式，使用固定样式值的元素可能需要单独调整。项目内保存修改后仍需发布更新，线上网站才会变化。

来源：[Design and preview](https://help.atoms.dev/en/articles/12129553-design-and-preview)。

### 源码和历史版本

Editor 支持文件树、文件名搜索、手动修改和 Diff。编辑会话可以预览、整体提交或丢弃；对话中可引用项目文件作为上下文。项目可导出 ZIP，相关能力可能受套餐或权限限制。

Restore 修改当前项目；Remix 创建独立项目。带后端的项目可能无法提供历史预览，恢复时也可能涉及是否同步数据库。

来源：[Code and files](https://help.atoms.dev/en/articles/12129559-code-and-files)、[Project History](https://help.atoms.dev/en/articles/12129557-project-history)。

### 后端和发布

Atoms Cloud 管理数据库、应用用户、文件、密钥与 AI 使用。连接器的实际读写能力以各自提供的操作和授权为准。

Share 用于分享 Atoms 项目，Publish 用于向访问者提供成品网站。发布后的编辑需要单独更新线上版本，支持自定义域名。

来源：[Atoms Cloud](https://help.atoms.dev/en/articles/12129561-atoms-cloud)、[Connectors](https://help.atoms.dev/en/articles/12129568-integrations)、[Share a project](https://help.atoms.dev/en/articles/12129574-share-a-project)、[Publish your project](https://help.atoms.dev/en/articles/12129577-publish-your-project)。

## Demo 实现建议

以下是根据本次挑战的时间与交付要求提出的范围建议，为当时的范围建议；当前已实现范围以交付说明为准。

### 优先完成

1. 项目列表与创建入口。
2. 对接真实模型，根据自然语言生成可运行应用。
3. 显示与实际执行对应的进度、生成结果及错误状态。
4. 可交互的应用预览。
5. 在现有结果上通过对话继续修改。
6. 持久化项目、消息、生成文件及版本，刷新后可以继续。
7. 部署 Demo 本身，提供可测试链接与清晰运行说明。

### 延展能力

优先考虑版本历史、预览和恢复，再考虑源码查看与下载、桌面和手机预览切换。它们与生成和迭代的主流程直接相关，也便于演示验证。

多角色协作可以作为后续能力；如果实现，应体现真实的分工和产物交接。完整可视化编辑器、通用云后端、多种连接器、计费与运营系统会明显扩大范围，建议排在核心闭环之后。

### 验收示例

输入“创建一个能添加和完成任务的待办应用” → 生成后可实际操作 → 要求增加筛选功能 → 新版本可用 → 刷新后项目与对话仍在 → 可以恢复之前版本（若纳入延展范围）。

需区分平台保存项目数据与生成应用自身保存业务数据，并分别验证。

## 其他参考

- [Dashboard Overview](https://help.atoms.dev/en/articles/12129546-dashboard-overview)
- [Analytics Overview](https://help.atoms.dev/en/articles/12129580-analytics-overview)

## 待实际体验确认

- 中文产品首页及项目工作区的当前布局、视觉样式。
- 登录后的可用角色、模型和功能入口。
- 真实生成速度、预览刷新、错误恢复与版本恢复效果。
- 当前账号对应的套餐限制和发布可用性。
