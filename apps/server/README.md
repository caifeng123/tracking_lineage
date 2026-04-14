# @tracking-lineage/server

血缘追踪的 HTTP 服务 + Dashboard 后端。

基于 Hono 框架，提供 REST API 用于管理仓库、触发分析任务、查询分析结果，并托管前端静态资源。

## 架构

```
src/
├── index.ts                  # 服务启动入口
├── app.ts                    # Hono 应用工厂 — 路由注册、中间件、静态文件
│
├── routes/
│   ├── analyze.ts            # 分析任务管理（创建/查询/SSE 进度流）
│   ├── repos.ts              # 仓库管理（克隆/列表/删除/SSE 克隆进度）
│   ├── trees.ts              # 调用树查询（根列表/详情/结构化树）
│   └── files.ts              # 文件读取（源码内容/目录列表）
│
├── services/
│   ├── repoReader.ts         # 仓库文件读取服务
│   └── resultReader.ts       # 分析结果读取服务
│
├── utils/
│   └── structuralTree.ts     # 调用树结构化工具
│
└── public/                   # 前端构建产物（静态文件）
```

## API 概览

### 仓库管理

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/repos` | 已克隆仓库列表 |
| POST | `/api/repos` | 克隆 git 仓库 |
| DELETE | `/api/repos/:repoName` | 删除仓库 |
| GET | `/api/repos/:cloneId/stream` | SSE 克隆进度 |
| GET | `/api/overview` | 仓库概览（含分析统计） |

### 分析任务

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/repos/:repoName/analyze` | 创建分析任务 |
| GET | `/api/repos/:repoName/analyze` | 任务列表 |
| GET | `/api/repos/:repoName/analyze/:jobId` | 任务详情 |
| GET | `/api/repos/:repoName/analyze/:jobId/stream` | SSE 分析进度 |

### 数据查询

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/repos/:repoName/metadata` | 仓库元信息 |
| GET | `/api/repos/:repoName/params` | 已分析参数列表 |
| GET | `/api/repos/:repoName/trees` | 调用树根列表 |
| GET | `/api/repos/:repoName/trees/:rawParam` | 调用树详情 |
| GET | `/api/repos/:repoName/files/*` | 源码文件内容 |

## 开发

```bash
# 开发模式（tsx watch 热加载）
pnpm dev
# 等价于在 monorepo 根：pnpm dev

# 构建
pnpm build

# 生产启动
pnpm start
# 或：PORT=8080 node dist/index.js
```

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 服务端口 | `3000` |
| `NO_OPEN` | 启动时不自动打开浏览器 | `false` |

> LLM 相关配置由 `@tracking-lineage/core` 的 `ConfigManager` 统一管理，参见 core 的 README。

## 打包部署

```bash
# 在 monorepo 根执行
pnpm pack:server

# 产物在 output/server/，包含：
# - dist/          编译后的服务端代码
# - node_modules/  生产依赖（含 @tracking-lineage/core）
# - deploy-server.sh  PM2 部署启动脚本

# 部署
cd output/server && ./deploy-server.sh
```

## 依赖

- `@tracking-lineage/core` (workspace) — 分析引擎
- `hono` — HTTP 框架
- `@hono/node-server` — Node.js 适配器
- `open` — 自动打开浏览器
