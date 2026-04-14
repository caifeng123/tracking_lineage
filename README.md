# Tracking Lineage

代码参数血缘追踪工具 — 分析指定参数在整个代码仓库中的完整数据流向。

通过 AST 分析 + LLM 语义理解，自动追踪参数从入口到消费的完整调用链，生成可交互的调用树视图。

## 项目结构

```
tracking_lineage/
├── packages/
│   └── core/              # @tracking-lineage/core — 分析引擎 + CLI
├── apps/
│   ├── server/            # @tracking-lineage/server — HTTP 服务 + Dashboard
│   └── web/               # @tracking-lineage/web — 可视化前端
├── scripts/               # 打包 & 部署脚本
├── tsconfig.base.json     # 公共 TypeScript 配置
├── pnpm-workspace.yaml    # pnpm workspace 声明
└── .env.example           # 环境变量模板
```

### 依赖关系

```
packages/core（引擎 + CLI）      ← 无内部依赖，可独立发布
      ▲
      │ workspace:*
apps/server（HTTP 服务）          ← 依赖 core
apps/web（前端）                  ← 独立，无内部依赖
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装

```bash
git clone https://github.com/caifeng123/tracking_lineage.git
cd tracking_lineage
cp .env.example .env   # 填入 LLM API 配置
pnpm install
```

### 开发

```bash
# 启动后端服务（开发模式，热加载）
pnpm dev

# 启动前端（开发模式，Vite）
pnpm dev:web

# 运行 CLI 分析（开发模式）
pnpm dev:cli -- ecom_scene_id -t /path/to/repo
```

### 构建

```bash
# 全量构建
pnpm build

# 单独构建
pnpm build:core
pnpm build:server
pnpm build:web
```

### 生产启动

```bash
# 启动 HTTP 服务
pnpm start

# 指定端口
PORT=8080 pnpm start
```

## CLI 用法

```bash
# 分析参数血缘
tracking-lineage <param1> [param2] ... [options]

# 示例
tracking-lineage ecom_scene_id -t /path/to/repo
tracking-lineage ecom_scene_id -t /path/to/repo --only 5
tracking-lineage ecom_scene_id -t /path/to/repo --from 3 --debug
```

| 选项 | 说明 |
|---|---|
| `-t, --target <dir>` | 目标 git 仓库路径（默认当前目录） |
| `-o, --output <dir>` | 结果输出目录 |
| `--from <N>` | 从第 N 阶段开始（1-5） |
| `--to <N>` | 运行到第 N 阶段（1-5） |
| `--only <N>` | 只运行第 N 阶段 |
| `--debug, -d` | 调试模式 |

## 分析流程（Pipeline）

| 阶段 | 名称 | 说明 |
|---|---|---|
| Stage 1 | 项目概览分析 | AI Agent 分析项目结构和技术栈 |
| Stage 2 | 参数变种发现 | LLM 识别参数的命名变种（驼峰、下划线等） |
| Stage 3 | 全局函数定位 | Grep 全局搜索 + AST 精确定位函数位置 |
| Stage 4 | 依赖图构建 | BFS 遍历函数调用关系，构建依赖图 |
| Stage 5 | 调用树语义分析 | LLM 分析调用树语义，生成可读报告 |

## 打包 & 部署

```bash
# 打包前端（产物 → output/web/）
pnpm pack:web

# 打包后端 + CLI（产物 → output/server/）
pnpm pack:server

# 在产物目录下部署启动（PM2）
cd output/server && ./deploy-server.sh
```

## 环境变量

参考 `.env.example`：

| 变量 | 说明 |
|---|---|
| `LLM_BASE_URL` | LLM API 地址（Anthropic Messages 格式） |
| `LLM_API_KEY` | LLM API Key |
| `LLM_MODEL` | LLM 模型名 |
| `AGENT_MODEL` | Claude Agent 模型名 |
| `PORT` | Server 端口（默认 3000） |

## 脚本速查

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发启动 server |
| `pnpm dev:web` | 开发启动前端 |
| `pnpm dev:cli` | 开发模式运行 CLI |
| `pnpm build` | 全量构建 |
| `pnpm start` | 生产启动 server |
| `pnpm test` | 运行 core 测试 |
| `pnpm pack:web` | 打包前端 |
| `pnpm pack:server` | 打包后端 + CLI |

## License

MIT
