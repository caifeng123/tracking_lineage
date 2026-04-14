# @tracking-lineage/web

血缘追踪的可视化前端，基于 React + Ant Design 构建。

提供仓库管理、分析任务监控、调用树可视化浏览、源码查看等完整的 Dashboard 体验。

## 技术栈

- **React 18** + **TypeScript**
- **Ant Design 5** — UI 组件库
- **React Router 6** — 路由管理
- **Monaco Editor** — 代码查看器
- **React Markdown** — Markdown 渲染
- **Vite 6** — 构建工具

## 页面结构

```
src/
├── App.tsx                     # 路由配置
├── main.tsx                    # 入口
│
├── pages/
│   ├── RepoListPage/           # L1: 仓库列表 — 查看/克隆/删除仓库
│   ├── RepoDetailPage/         # L2: 仓库详情 — 已分析参数 + 提交新分析
│   ├── ParamRootsPage/         # L3: 参数调用树根列表
│   └── TreeDetail/             # L4: 调用树详情 — 交互式树 + 源码 + 报告
│
├── components/
│   ├── CallTree/               # 调用树组件 — 树形展示 + 节点交互
│   ├── CodeViewer/             # 代码查看器 — Monaco Editor 封装
│   ├── FileTree/               # 文件树组件 — 目录浏览
│   └── ReportPanel/            # 报告面板 — Markdown 语义分析报告
│
├── hooks/
│   └── useTreeDetail.ts        # 调用树详情数据 Hook
│
├── services/
│   ├── api.ts                  # 基础请求封装
│   ├── repoApi.ts              # 仓库相关 API
│   └── analyzeApi.ts           # 分析任务 API
│
└── types/
    ├── index.ts                # 公共类型
    ├── all.ts                  # 全局类型
    └── analyze.ts              # 分析任务类型
```

## 路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | RepoListPage | 仓库列表，支持克隆新仓库 |
| `/repo/:repoName` | RepoDetailPage | 仓库详情，查看已分析参数，提交新分析 |
| `/repo/:repoName/param/:rawParam` | ParamRootsPage | 参数下的所有调用树根节点 |
| `/repo/:repoName/param/:rawParam/tree` | TreeDetail | 调用树详情，含代码查看和语义报告 |

## 开发

```bash
# 开发模式（Vite dev server）
pnpm dev
# 等价于在 monorepo 根：pnpm dev:web

# 构建
pnpm build

# 预览构建产物
pnpm preview
```

开发时前端默认请求 `http://localhost:3000`（后端），请确保后端服务已启动。

可在 `vite.config.ts` 中配置 proxy 指向后端开发服务。

## 打包

```bash
# 在 monorepo 根执行
pnpm pack:web

# 产物在 output/web/，纯静态文件：
# - index.html
# - assets/
#   ├── index-xxx.js
#   └── index-xxx.css
```

产物可直接部署到 CDN / Nginx / OSS，或复制到 `apps/server/src/public/` 由后端托管。

## 依赖

- `react` / `react-dom` — UI 框架
- `antd` / `@ant-design/icons` — 组件库
- `react-router-dom` — 路由
- `@monaco-editor/react` — 代码编辑器
- `react-markdown` / `remark-gfm` / `rehype-highlight` — Markdown 渲染
