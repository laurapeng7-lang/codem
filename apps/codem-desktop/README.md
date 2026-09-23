# Meego AI Assistant

基于指定 [Figma 节点](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-11296) 实现的 React + TypeScript Web App。

## 代码仓库

项目托管于 Codebase 个人空间：[liudachang.al/meego-ai-agent-playground](https://code.byted.org/liudachang.al/meego-ai-agent-playground)，主分支为 `main`，保留完整 Git 提交历史。

```bash
git clone https://code.byted.org/liudachang.al/meego-ai-agent-playground.git
cd meego-ai-agent-playground
```

## 运行

```bash
npm install
npm run dev -- --port 5173
```

打开 http://localhost:5173。

```bash
npm run build
npm run preview
```

## Vercel 部署

公网地址：[meego-ai-agent-playground.vercel.app](https://meego-ai-agent-playground.vercel.app)。

项目部署在 **DC's projects（dc-delta）** 团队，项目名为 `meego-ai-agent-playground`。[管理项目](https://vercel.com/dc-delta/meego-ai-agent-playground)。

2026-09-14 首次发布代码版本 `43492e7`，Vercel 云端构建通过，部署状态为 `Ready`。首次部署由 Vercel 自动分配为正式部署并绑定上述域名。项目已关闭 Vercel 登录保护，无密码或 IP 访问限制，可公开分享。部署记录：`dpl_cXhYm3odceoTTS49fSQuoEeYVcaD`。

`vercel.json` 指定 Vite 构建及 `dist` 输出目录。部署前在目标 Vercel 账户登录，后续预览部署运行：

```bash
vercel deploy --yes --scope dc-delta --target preview
```

确认需要更新正式域名时使用 `vercel deploy --yes --scope dc-delta --prod`。

`.vercelignore` 排除设计参考、检查脚本、开发输出、环境变量文件和资源来源记录；完整报告、字体、图标及应用代码随构建发布。CLI 生成的本地项目关联信息位于 `.vercel/`，不纳入 Git。

## 页面与交互

- 左侧导航：搜索、应用分组收起、工作空间菜单、导航收起。文件夹固定保持收起，不支持展开。Marketplace 入口打开 `/marketplace`，AI Agent 返回对话页；其余项目或应用保留导航选中交互。
- 左下角头像：点击向上展开“企业管理平台 / 开放平台”和“偏好设置 / MCP 配置”两组菜单，中间带分隔线。支持再次点击头像、点击外部、焦点移出或 Escape 收起，以及方向键、Home、End 导航。图标从 Figma 组件库导出至 `public/assets/figma/profile-menu/`，同目录记录来源和资源指纹。“企业管理平台”跳转 `/admin`，其他菜单项提示页面尚未接入。
- 中间对话：独立滚动、历史对话、新建对话、引用项目和技能菜单、添加和移除附件；输入框只读，始终显示 placeholder，发送消息已禁用。
- 右侧产物：打开独立的“报告框架”标签、产物标签切换、预览与代码切换、下载图片和网页、复制预览链接、关闭与重新打开。重复点击框架卡片会选中已有标签；关闭当前标签后切换到相邻标签。
- 输入框固定显示占位文字。Escape 关闭菜单和移动端导航。

这是可交互的前端演示。发送和自动回复已移除，之前试发的消息不再显示，仅保留设计稿中的示例对话。附件仅在本地显示文件名。聊天中的框架卡片保留设计稿内容，右侧分析报告预览使用用户指定的完整报告构建。

新会话页点击“深度报告”后，按照 [Figma 节点 9:835](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=9-835) 切换页面：输入框工具栏显示可关闭的绿色标签，快捷入口替换为三条报告建议问题，模板库展示 12 个项目分析模板。分类包括组合管理、精益度量、关键路径、风险矩阵和复盘改进，支持点击筛选及方向键切换；关闭标签或再次新建对话恢复普通新会话页。新增资源负载、季度目标达成、交付周期分布、跨项目依赖、风险治理和持续改进模板。输入框仍只读并显示占位文字，点击建议问题或模板不发送消息。

深度报告页保持 720px 内容宽度、126px 输入框、36px 建议行、48px 模板区间距及三列 232 × 196px 卡片；窄屏切换为两列或单列，工具栏自动换行。标签的两个图标为 Figma 原始 SVG；12 张模板 PNG 封面参考现有报告主题的配色、字体和布局，以示例内容制作。封面与来源记录位于 `public/assets/report-templates/`，生成脚本为 `scripts/generate-report-template-covers.py`（Pillow + macOS 宋体／黑体字体，无需浏览器）。

选中或取消“深度报告”时，仅替换输入框下方的建议与模板内容，用 200ms 淡入和 6px 上移作轻量过渡；标题、输入框与附件保持挂载，分类重置为“最佳实践”。首次进入新会话不播放此动画，快速切换会取消上一段动画；系统开启“减少动态效果”时直接切换，当前播放的动画也会随设置变更取消。

## Figma 还原

原稿为 1800 × 1184。1800px 下导航为 240px，对话区为 480px，间隔 10px，右侧预览宽度为 1062px。字体遵循原稿使用 macOS 系统字体和 PingFang SC，其他平台使用对应后备字体。

按后续调整要求，对话区的英文和数字统一使用本地 Inter 字体，中文回退到 PingFang SC 等中文字体，包含正文、工具耗时、时间戳和输入框。中英文相邻处使用半角空格，例如 `需要 project-key`、`从 URL 中看到 leopard`。字体文件和许可证位于 `public/fonts/inter/`。

初始右侧“项目进展与风险分析报告”的“预览”页签直接展示完整报告。点击对话中的“报告框架”卡片，在右侧新开“报告框架”标签，保留已有报告标签。点击下方生成的报告文件卡片则切回报告预览。

点击“新建对话”后，地址会带上 `?view=new-chat`。直接打开或刷新带此参数的链接会展示新会话页并关闭右侧预览，可复制地址转发；浏览器前进、后退同步切换页面。发送提示词或选择历史会话后会移除此参数，保留其他查询参数。报告预览链接 `#report` 继续可用。

Marketplace 按 [Figma 节点 19:6040](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=19-6040) 实现，替换整个右侧工作区：五个顶部分类、双 Banner、四张热门模板、四张热门 Agent 技能卡片、六个 AI 应用、六个插件和两个学院入口。1200px 内容宽度下按原稿使用左右 24px 留白、200px Banner、40px 区块间距；按右侧实际可用宽度切换卡片列数和 Banner 排列。分类及 View more 可切换内容；技能卡片进入新会话，其他卡片打开介绍弹窗，支持点击外部或 Escape 关闭。64 个图标、封面及插画直接从 Figma 导出到 `public/assets/figma/marketplace/`，同目录记录节点来源和 SHA-256。支持直接打开、刷新 `/marketplace` 和浏览器前进后退；Vercel 已配置该路径的入口重写。

热门 Agent 技能位于热门模板下方，依据 [Figma 节点 19:22820](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=19-22820) 实现。桌面使用四列、12px 卡片间距、8px 内边距和 100px 高封面；窄屏切换为两列或单列。四张封面以 3 倍尺寸（789×300）导出，保留原稿内容和圆角。

四个分类页按 [Figma 节点 19:34723](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=19-34723) 实现，顶部顺序为 Discover、AI Apps、Agent Skills、Plugins、Templates。AI Apps 默认展示 20 张应用卡片；其余三页分别展示 16 张技能卡片、24 张插件卡片和 16 张模板卡片。场景筛选按本地示例数据切换结果，分类切换时恢复默认筛选。首页各区块的 View more 打开对应分类页，各类卡片的点击行为与首页一致。分类标签和筛选栏在窄屏下可以横向滚动，卡片随可用宽度切换四列、两列或单列。新增图标以 96×96、技能封面以 789×300 从 Figma 原始节点导出，复用已有相同资源。

Templates 根据 [Figma 节点 19:33642](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=19-33642) 扩展为四行、16 张卡片，原首行下方新增三行不同的行业模板，替换旧的重复行。12 张封面按 3 倍尺寸（837×450）直接导出；卡片名称、行业分类、筛选关联与详情介绍按封面内容配置，覆盖能源 LTC、敏捷研发、机器人、消费品、CRM、软件交付、整车合规、内容制作、消费电子和门店筹建。

Plugins 展示 24 个不同的插件示例，每项独立配置名称、功能描述、图标、下载量和适用场景。Discover 的六张热门插件卡片与分类页共享数据；新增测试用例、移动端预览、图片标注、自动化流程、预算管理、代码评审、发布提醒、文档翻译、标签管理和 API 连接器。图标复用现有 Figma 本地导出资源，保留各自边框与圆角，独立白色 SVG 使用匹配的彩色底。新增需求关系图、里程碑日历、发布检查清单、验收记录管理、服务告警中心、成员权限同步、团队值班排期和文档汇编导出 8 项；沿用 42px、8px 圆角、高饱和纯色底与 26px 白色 Figma 图形。插件能力与下载量均为演示数据，不代表真实市场统计或已接入服务。

Agent Skills 的 16 个技能按轻应用搭建、项目开发、流程配置、项目复盘、项目质量、团队周报、人力分析、风险管理分为八组，每组两项，名称、描述和筛选场景一一对应。首页热门技能与分类页共享文案。AI Apps 的 20 张卡片及首页 6 个热门应用按各自名称说明输入内容、使用场景和预期产出，详情弹窗沿用同一描述；这些内容是演示用能力说明，未接入实际生成服务。

AI Apps 新增的 11 项覆盖翻译、打标、关键词、纪要、需求拆解、里程碑、版本说明、验收、风险、负责人和团队容量。新增图标沿用 32px、6px 圆角、高饱和纯色背景与 20px 白色图形的样式；原有 9 项继续使用原始完整图标。白色图形均复用 Figma 本地导出资源，复用文件来源和指纹记录在 Marketplace 的 `provenance.json` 中。

点击 Discover 的热门技能或 Agent Skills 分类页的技能卡片后，进入 `/?view=new-chat`，左侧选中 AI Agent，关闭右侧预览并开启“深度报告”。输入框按所选技能的名称和描述预填可编辑提示词，自动聚焦；用户点击发送后，沿用现有演示流程打开“生成项目总结报告”对话和内置报告预览。选择技能本身不会发送，其他查询参数保留。

## 企业管理后台

`/admin` 按 [Figma 节点 26:1062](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/vercel-playground?node-id=26-1062) 实现独立后台布局：44px 顶栏、240px 管理导航、24px 内容留白，以及空间列表展示范围、任务设置、模版共享和主导航入口配置四块设置卡片。从头像菜单进入，支持直接访问、刷新及浏览器前进后退；点击左上“飞书项目”返回工作区。

管理导航支持分组展开收起和整栏折叠，小屏改为抽屉。开关及导航顺序保存在当前浏览器的 `meego-admin:function-settings:v1` 中；“主页”和“AI Agent”固定开启且不可移动，悬停或键盘聚焦整行显示浅色提示“飞书项目系统默认启用并置顶，暂不支持修改”，支持 Escape 关闭。其他三项支持拖动或聚焦手柄后用上下方向键排序：拖动项跟随指针，相邻行平滑让位，松手后用 220ms 过渡归位并保存顺序；取消拖动恢复原位，系统减少动态效果设置会关闭过渡。这些是本地设置演示，不改变企业数据或主工作区导航；其他管理子页尚未接入。15 个新增图标均由原始 Figma 节点导出，来源和 SHA-256 记录于 `public/assets/figma/admin/provenance.json`。

## 完整报告嵌入

报告来源于会话 `01a09ee1-0401-73d3-a91e-4be3e29a91fb`（“分析项目视图并生成进展报告 (2)”）指定的 `http://127.0.0.1:8766/outputs/project-risk-report-beautified.html`。完整 HTML 随项目保存在 `public/reports/project-risk-report-beautified.html`，保留原有内容、样式、全部字体、图表库和许可证，运行不依赖 8766 服务。嵌入适配增加模式和主题控制接口，来源、原文件及当前版本的 SHA-256 记录于同目录的 `provenance.json`。

预览通过同源 iframe 占满可用区域，原页面按照预览窗口宽度适配，样式与外层应用隔离。保留 46 个主题、整页阅读／翻页演示、图表交互与主题配色、风险矩阵联动、风险和优先级筛选、搜索、演示目录、页码跳转、全屏、快捷键、触摸翻页、文案编辑及保存。两种阅读模式共用主题，偏好和文案仍由原报告保存在当前站点的 localStorage 中。不同端口的浏览器存储互相独立，不自动迁移 8766 下的个人设置。

外层 toolbar 按 [Figma 节点 1:12162](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-12162) 实现：48px 高度、左右 12px 留白，右侧为 32px 高的“演示模式”胶囊、圆形主题按钮与全圆角更多操作按钮，间距 8px。每次进入演示模式从第一页开始，不恢复上次页码；toolbar 切换为黑底，按钮文字和图标反白，退出按钮使用关闭图标；再次点击可返回整页阅读并恢复浅色 toolbar。预览窗口宽度不超过 500px 时使用图标入口，并保留完整提示文案。主题面板仅保留 46 个配色选项，默认主题“飞书项目”排在第一项，无搜索框，点击立即应用并保持展开，方便连续比较；点击面板外部或按 Escape 收起，也可使用关闭按钮。切换模式保持当前主题，状态由报告同步到 toolbar。

iframe 使用 `?embedded=1` 隐藏原来的模式和主题入口，由 toolbar 直接调用报告的控制接口；独立打开或下载的 HTML 保留自身入口。报告页签存在期间保持 iframe 挂载，切换“代码”或“报告框架”不会重新加载报告。代码视图仅折叠体积较大的内嵌资源文本，下载网页仍返回完整 HTML。PNG 导出使用当前主题：阅读模式导出阅读内容，演示模式导出当前页；最长边限制为 16384 像素。原报告内部的“保存 HTML”保留其原有编辑保存行为。

嵌入报告隐藏“项目研报”标识及“项目组合治理诊断／专业研报摘要”说明栏，保留阅读模式的目录导航并收紧顶部留白。演示模式隐藏报告自身的顶部栏（含“编辑文字”按钮），画布按照剩余空间重新居中；原有 E 编辑快捷键及底部演示控制继续可用。

默认主题为“飞书项目”（Feishu Project），主色为 `#5E36EF`，报告强调色、浅色背景、图表及菜单缩略图同步使用这组蓝紫配色。首次打开、无法读取偏好或已保存的主题无效时使用此主题；有效的手动主题选择继续保留。

分析报告的更多操作菜单按照 [Figma 节点 1:13284](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-13284) 实现：宽度 220px，32px 菜单行，14px 字号，16px 图标和 8px 分隔区域。菜单包含“下载为图片”“下载为网页”“复制链接”和“允许通过链接访问”。图片导出为 PNG；网页导出完整 HTML；复制的本地预览链接带 `#report`，打开后直接展示报告。链接访问开关仅演示本地状态，不发布报告，也不改变服务端访问权限。

“报告框架”按 [Figma 节点 1:9121](https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-9121) 实现：文档最大宽度 720px，四周 24px，18/16/14px 字号，28/24/22px 行距，章节间距 20px、段落间距 12px。文字和加粗直接提取自设计稿。表格按原稿三列排列；最后一张表格保留 222px 高度，长单元格可滚动查看全文。预览区域不超过 520px 时，列改为上下排列并完整展开。对话内框架卡片顶部增加 6px 外边距，与工具调用行共保持 12px 间隔。

55 个图标、图片、分隔线及开关资源直接导出自 Figma，保存在 `public/assets/figma/`；SVG 文件未经重绘，页面通过 `<img>` 引用本地文件。`provenance.json` 记录资源来源，`scripts/export-assets.py` 是导出脚本。Figma 的临时下载链接可能过期，已下载的本地资源不受影响。

`public/favicon.svg` 复用原始 Logo 的图形和渐变，仅将外层尺寸设为正方形并开启等比居中，避免浏览器标签拉伸图标。

## 宽度适配

| 宽度 | 布局 |
| --- | --- |
| 大于 1500px | 240px 导航、480px 对话、弹性预览 |
| 1101–1500px | 220px 导航、400–480px 对话、弹性预览 |
| 761–1100px | 导航抽屉、并排对话和预览 |
| 760px 及以下 | 导航抽屉，通过顶部标签切换对话和预览 |

输入框固定在对话区底部，正文独立滚动；对话内容末尾留有 24px 外边距，留白随内容滚动。导航与预览也可以独立滚动。页面使用 `100dvh`，适应移动端可见高度变化。

报告内目录 tab 居中排列，所有宽度下统一使用 14px 字号、20px 行高，左右内边距为 16px，预览宽度不超过 420px 时调整为 12px；空间不足时可横向滚动。演示控制条的按钮文字保持单行，页码选择框优先收缩；不超过 420px 时，页码选择框移到第二行，目录、翻页与全屏按钮保留在第一行。

## 验证

已通过 TypeScript 检查和 Vite 生产构建。已加载桌面页面并保存 1800 × 1184 截图，随后按用户要求停止浏览器验收；最终视觉效果、不同宽度与交互由用户验收。

报告嵌入可通过 `npm run build && npm run check:report` 检查版本文件指纹、构建资源、主题和脚本完整性、模式和主题状态同步、加载失败重试与完整 HTML 下载。此检查不启动浏览器，也不代替视觉和交互验收。

`npm run build && node scripts/check-report-start.mjs` 检查新会话报告流程、Marketplace 路由与分类状态，以及原始资源指纹和构建产物完整性；不运行浏览器自动化。

- 设计原图：`design/figma-reference.png`
- 首版桌面截图（仅保存在本地，不纳入版本控制）：`output/playwright/desktop-1800.png`
- 页面样式：`src/styles.css`
- 组件和交互：`src/main.tsx`
- 报告嵌入：`src/ReportPreview.tsx`、`src/report-preview.css`
- 报告 toolbar 与主题面板：`src/report-controls.ts`、`src/ReportThemePanel.tsx`、`src/report-toolbar.css`、`src/report-themes.json`
- 报告加载和导出：`src/report.ts`
- 完整报告构建：`public/reports/project-risk-report-beautified.html`
- 框架文档：`src/FrameworkDocument.tsx`、`src/framework.css`
- 框架原始文案：`src/framework-content.json`
- 产物标签状态：`src/artifact-tabs.ts`
