# CodeM demos

CodeM 产品演示集合。各演示保持独立构建，可以从同一个仓库分别连接到 Vercel。

## 应用

| 目录 | 内容 | 本地启动 | Vercel Root Directory |
| --- | --- | --- | --- |
| `apps/codem-desktop` | CodeM 桌面端与自动任务演示 | `npm install && npm run dev` | `apps/codem-desktop` |
| `apps/lark-hifi` | 飞书高保真演示 | `npm install && npm run dev` | `apps/lark-hifi` |
| `apps/codem-web-app` | CodeM Web App 静态演示 | `npm run build && npm run preview` | `apps/codem-web-app` |

## Vercel 部署

从本仓库为每个应用分别创建 Vercel Project，并将 Root Directory 设置为上表中的对应目录。各应用都已在自己的目录中提供构建和路由配置。

建议将生产分支设置为 `main`。后续对任一演示的修改都提交到本仓库，Vercel 会根据对应目录重新构建。
