# CodeM demos

CodeM 产品演示集合。各演示保持独立构建，可以从同一个仓库分别连接到 Vercel。

## 应用

| 目录 | 内容 | 本地启动 | Vercel Root Directory |
| --- | --- | --- | --- |
| `apps/codem-desktop` | CodeM 桌面端与自动任务演示 | `npm install && npm run dev` | `apps/codem-desktop` |
| `apps/lark-hifi` | 飞书高保真演示 | `npm install && npm run dev` | `apps/lark-hifi` |

## Vercel 部署

从本仓库分别创建两个 Vercel Project，并将 Root Directory 设置为上表中的对应目录。两个应用都已在各自目录中提供构建和路由配置。

建议将生产分支设置为 `main`。后续对任一演示的修改都提交到本仓库，Vercel 会根据对应目录重新构建。
