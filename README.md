# tracking-lineage

代码参数血缘追踪工具 — 通过 **AST 静态分析 + LLM 语义理解**，自动追踪指定参数在整个代码仓库中的完整数据流向，构建参数的调用链路图并生成 AI 分析报告。

## 功能特性

- **参数血缘追踪**：从函数入参到最终消费，完整追踪参数的传递、变换、展开、合并链路
- **智能变种发现**：AI 搜索 + 正则生成 + Grep 交叉验证，自动识别参数的所有命名变体（如 `log_extra` → `logExtra` → `reportExtraParam`）
- **AST 精确定位**：基于 TypeScript AST 解析，精确定位参数出现的函数、文件和行号
- **调用树构建**：BFS 并发遍历函数调用关系，构建完整的参数传递调用树
- **AI 语义分析**：Claude Agent 对每棵调用树生成结构化的血缘分析报告
- **Web 可视化管理平台**：
  - 多仓库管理（克隆、更新、删除）
  - 在线提交分析任务，实时查看进度（SSE 推送）
  - 交互式调用树浏览
  - Monaco Editor 代码阅读器（语法高亮 + 行号定位）
  - AI 分析报告渲染（Markdown + 路径链接可跳转）

## 项目结构

```
tracking-lineage/
├── src/                        # 核心分析引擎
│   ├── cli.ts                  # CLI 入口
│   ├── config.ts               # 配置管理
│   ├── pipeline/               # 五阶段分析流水线
│   │   ├── Pipeline.ts         # 流水线调度器
│   │   └── stages/
│   │       ├── ProjectAnalyzeStage.ts    # Stage 1: 项目概览分析
│   │       ├── ParamVariantStage.ts      # Stage 2: 参数变种发现
│   │       ├── ParamLocateStage.ts       # Stage 3: 全局函数定位
│   │       ├── DependencyGraphStage.ts   # Stage 4: 依赖图构建
│   │       └── TreeAnalyzeStage.ts       # Stage 5: 调用树语义分析
│   ├── ast/                    # AST 分析模块
│   │   ├── FunctionLocator.ts  # 函数定位器
│   │   ├── ReferenceAnalyzer.ts# 引用分析器
│   │   └── ProjectManager.ts   # 项目管理器
│   ├── tree/                   # 调用树构建
│   │   └── CallTreeBuilder.ts  # 调用树构建器
│   ├── llm/                    # LLM / Agent 客户端
│   │   ├── LLMClient.ts        # 单轮 LLM 调用
│   │   ├── AgentClient.ts      # 多轮 Claude Agent 调用
│   │   └── prompts/            # Prompt 模板
│   ├── search/                 # 搜索模块（Grep / 正则）
│   ├── storage/                # 结果存储（文件系统）
│   ├── git/                    # Git 信息提取
│   └── utils/                  # 通用工具
├── server/                     # Web 后端（Hono）
│   ├── app.ts                  # 应用入口，路由注册
│   ├── index.ts                # 服务启动
│   ├── routes/
│   │   ├── repos.ts            # 仓库管理 API（CRUD + 克隆）
│   │   ├── analyze.ts          # 分析任务 API（提交 + SSE 进度）
│   │   ├── trees.ts            # 调用树数据 API
│   │   └── files.ts            # 文件内容 API
│   ├── services/
│   │   ├── resultReader.ts     # 分析结果读取
│   │   └── repoReader.ts       # 仓库文件读取
│   ├── utils/
│   │   └── structuralTree.ts   # 结构化调用树工具
│   └── public/                 # 前端构建产物
├── web/                        # Web 前端（React + Vite + Ant Design）
│   └── src/
│       ├── App.tsx             # 路由配置
│       ├── pages/
│       │   ├── RepoListPage/   # L1: 仓库列表 + 添加仓库
│       │   ├── RepoDetailPage/ # L2: 仓库详情 + 参数分析 + 实时进度
│       │   ├── ParamRootsPage/ # L3: 参数下的调用树根列表
│       │   └── TreeDetail/     # L4: 调用树详情（代码 + 报告 + 树）
│       ├── components/
│       │   ├── CallTree/       # 交互式调用树组件
│       │   ├── CodeViewer/     # Monaco Editor 代码查看器
│       │   ├── FileTree/       # 文件目录树
│       │   └── ReportPanel/    # AI 分析报告面板
│       ├── services/           # API 调用封装
│       └── types/              # TypeScript 类型定义
├── repos/                      # 克隆的目标仓库存放目录
├── .results/                   # 分析结果存放目录
└── package.json
```

## 安装

```bash
# 克隆项目
git clone <repo-url>
cd tracking-lineage

# 安装依赖
npm install

# 构建（CLI + Web 前端）
npm run build

# Link 到全局（可选，用于命令行模式）
npm link
```

完成后即可在任意目录使用 `tracking-lineage` 命令。修改源码后只需重新 `npm run build`，无需再次 link。

```bash
# 取消全局 link
npm unlink -g tracking-lineage
```

## 使用方式

### 方式一：Web 管理平台（推荐）

启动 Web 管理平台，在浏览器中管理仓库、提交分析任务、查看结果：

```bash
# 启动管理平台（默认端口 3000，自动打开浏览器）
tracking-lineage --analyze

# 指定端口
tracking-lineage --analyze -p 8080

# 不自动打开浏览器
tracking-lineage --analyze --no-open
```

平台提供四级页面导航：

| 页面 | 路径 | 功能 |
|------|------|------|
| 仓库列表 | `/` | 查看所有仓库、克隆新仓库、删除仓库 |
| 仓库详情 | `/repo/:repoName` | 查看已分析参数、提交新分析任务、实时查看分析进度 |
| 参数根列表 | `/repo/:repoName/param/:rawParam` | 查看参数下所有调用树根节点，含节点数/文件数/深度统计 |
| 调用树详情 | `/repo/:repoName/param/:rawParam/tree` | 三栏布局：调用树 + 代码查看器 + AI 分析报告 |

### 方式二：命令行模式

在终端直接运行分析，结果保存到文件系统：

```bash
# 在目标仓库目录下直接运行
cd /path/to/your/repo
tracking-lineage ecom_scene_id

# 追踪多个参数
tracking-lineage ecom_scene_id recommend_info log_extra

# 指定目标仓库路径
tracking-lineage ecom_scene_id --target /path/to/repo

# 自定义输出目录
tracking-lineage ecom_scene_id -o ./my-results

# 分析完成后自动启动管理平台查看结果
tracking-lineage ecom_scene_id --target /path/to/repo --analyze
```

## 参数与选项

| 参数/选项 | 说明 |
|---|---|
| `<param>` | 要追踪的参数名（至少一个，命令行模式） |
| `-a, --analyze` | 启动 Web 管理平台 |
| `-t, --target <dir>` | 目标 git 仓库路径（默认当前目录） |
| `-o, --output <dir>` | 结果输出目录（默认 `<工具目录>/.results/<仓库名>`） |
| `-p, --port <port>` | Web 平台端口（默认 3000） |
| `--no-open` | 不自动打开浏览器 |
| `-h, --help` | 显示帮助信息 |
| `-V, --version` | 显示版本号 |

### 调试选项

支持按阶段部分运行，便于开发调试和重跑单个阶段：

| 选项 | 说明 |
|---|---|
| `--from <N>` | 从第 N 阶段开始运行（1-5），前序结果从磁盘恢复 |
| `--to <N>` | 运行到第 N 阶段结束（1-5） |
| `--only <N>` | 只运行第 N 阶段（等价于 `--from N --to N`） |
| `--debug, -d` | 打印详细调试信息 |

```bash
# 只运行 Stage 5（调用树语义分析），前序结果从磁盘恢复
tracking-lineage ecom_scene_id -t /path/to/repo --only 5

# 从 Stage 3 开始运行到结束
tracking-lineage ecom_scene_id -t /path/to/repo --from 3

# 只运行 Stage 2-3
tracking-lineage ecom_scene_id -t /path/to/repo --from 2 --to 3

# 重跑 Stage 4，带调试输出
tracking-lineage ecom_scene_id -t /path/to/repo --only 4 --debug
```

## 分析流水线

五阶段流水线，每个阶段的结果独立持久化到文件系统，支持断点续跑：

```
Stage 1          Stage 2          Stage 3          Stage 4          Stage 5
项目概览分析 ──→ 参数变种发现 ──→ 全局函数定位 ──→ 依赖图构建 ──→ 调用树语义分析
(Agent)         (AI + Grep)      (Grep + AST)     (BFS + LLM)      (Agent)
```

| 阶段 | 名称 | 方法 | 输出 |
|------|------|------|------|
| **Stage 1** | 项目概览分析 | AI Agent 自动阅读仓库代码 | 项目结构概览、技术栈、入口文件等 |
| **Stage 2** | 参数变种发现 | AI 搜索 + 正则生成 + Grep 验证 | 参数名 → 变种名映射对列表 |
| **Stage 3** | 全局函数定位 | Grep 全局搜索 + AST 解析定位 + Git blame | 参数出现的所有函数位置（文件、函数名、行号） |
| **Stage 4** | 依赖图构建 | BFS 并发遍历 + LLM 分析上下游关系 | 函数间依赖关系记录 |
| **Stage 5** | 调用树语义分析 | 构建调用树 + Agent 生成分析报告 | 完整调用树 + 逐节点的血缘分析报告 |

### 结果存储结构

```
.results/<repoName>/
├── metadata.json               # 分析元数据（仓库名、参数、时间戳等）
├── 1-projectAnalyze/           # Stage 1 输出
├── 2-aiParamVariant/           # Stage 2 输出
├── 3-searchParamsFunc/         # Stage 3 输出
├── 4-findCall/                 # Stage 4 输出
└── 5-treeAnalyze/              # Stage 5 输出
    └── <rawParam>/             # 按参数名分目录
        └── <param>.jsonl       # 每行一棵调用树（JSON Lines）
```

## 环境变量

在**目标仓库根目录**或**工具根目录**创建 `.env` 文件：

```env
# ==================== LLM 配置（Stage 2/3/4 单轮调用） ====================
LLM_BASE_URL=https://your-llm-api.com/v1/chat/completions
LLM_API_KEY=your-api-key
LLM_MODEL=your-model-name

# ==================== Claude Agent 配置（Stage 1/5 多轮调用） ====================
AGENT_MODEL=your-agent-model
ANTHROPIC_BASE_URL=http://127.0.0.1:3456
ANTHROPIC_AUTH_TOKEN=your-auth-token

# ==================== 并发控制 ====================
GRAPH_CONCURRENCY=5       # Stage 4 依赖图构建并发数
LLM_CONCURRENCY=10        # LLM 单轮调用并发数
AGENT_CONCURRENCY=10      # Agent 多轮调用并发数

# ==================== 业务配置 ====================
BUSINESS_KEY=your-business  # 业务标识
```

## API 接口

Web 管理平台提供以下 REST API：

### 仓库管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/repos` | 列出所有已克隆仓库 |
| `POST` | `/api/repos` | 克隆新仓库（支持 SSE 进度流） |
| `DELETE` | `/api/repos/:repoName` | 删除仓库 |

### 分析任务

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/:repoName/analyze` | 提交分析任务 |
| `GET` | `/api/:repoName/analyze` | 获取任务列表 |
| `GET` | `/api/:repoName/analyze/:jobId` | 获取任务状态 |
| `GET` | `/api/:repoName/analyze/:jobId/stream` | SSE 订阅任务进度 |

### 数据查询

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/:repoName/trees` | 获取所有调用树根列表 |
| `GET` | `/api/:repoName/trees/:rawParam` | 获取特定参数的调用树详情 |
| `GET` | `/api/:repoName/files` | 获取仓库文件目录树 |
| `GET` | `/api/:repoName/files/content` | 读取文件内容（支持语言检测） |

## 编程式调用

```typescript
import { Pipeline, ConfigManager, FileResultStore } from 'tracking-lineage';

const appConfig = ConfigManager.getAppConfig(['ecom_scene_id'], '/path/to/repo');
const store = new FileResultStore(appConfig.resultDir);
const pipeline = new Pipeline(appConfig, store);

// 完整运行
const result = await pipeline.run();

// 部分运行（如只运行 Stage 3-5）
const result = await pipeline.run({ fromStage: 3 });
```

## 开发

```bash
# 前后端同时开发
npm run dev -- --analyze              # 启动后端 + 前端 dev server

# 仅前端开发（需后端已在运行）
npm run dev:web                       # Vite dev server (端口 5173)

# 仅 CLI 开发
npm run dev -- ecom_scene_id -t /path/to/repo

# 运行测试
npm test

# 构建
npm run build                         # 构建 CLI + Web
npm run build:cli                     # 仅构建 CLI
npm run build:web                     # 仅构建 Web 前端
```

## 技术栈

| 模块 | 技术 |
|------|------|
| 核心引擎 | TypeScript, AST (ts-morph), BFS 并发调度 |
| LLM 集成 | Claude Agent SDK, OpenAI-compatible API |
| Web 后端 | Hono (Node.js), SSE (Server-Sent Events) |
| Web 前端 | React 18, Vite, Ant Design 5, React Router 6 |
| 代码编辑器 | Monaco Editor (VS Code 内核) |
| 报告渲染 | ReactMarkdown, remark-gfm, rehype-highlight |
| 构建工具 | TypeScript (tsc), Vite |

## License

MIT
