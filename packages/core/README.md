# @tracking-lineage/core

代码参数血缘追踪的核心引擎 + CLI 工具。

提供完整的分析 Pipeline：从参数变种发现到调用树语义分析，以及命令行入口供直接使用。

## 架构

```
src/
├── index.ts              # 库入口 — 导出所有公共 API
├── cli.ts                # CLI 入口 — 参数解析 + 调用 Pipeline
├── config.ts             # 配置管理 — .env 加载 + LLM/Agent 配置
│
├── pipeline/             # 分析流水线
│   ├── Pipeline.ts       # 主编排器，串联 5 个 Stage
│   ├── types.ts          # Pipeline 上下文类型
│   └── stages/
│       ├── ProjectAnalyzeStage.ts    # Stage 1: AI Agent 项目概览分析
│       ├── ParamVariantStage.ts      # Stage 2: LLM 参数变种发现
│       ├── ParamLocateStage.ts       # Stage 3: Grep + AST 全局函数定位
│       ├── DependencyGraphStage.ts   # Stage 4: BFS 依赖图构建
│       └── TreeAnalyzeStage.ts       # Stage 5: LLM 调用树语义分析
│
├── ast/                  # AST 分析
│   ├── ProjectManager.ts       # ts-morph 项目管理
│   ├── FunctionLocator.ts      # 函数定位器
│   └── ReferenceAnalyzer.ts    # 引用分析器
│
├── llm/                  # LLM 客户端
│   ├── LLMClient.ts            # Anthropic Messages API（流式）
│   ├── AgentClient.ts          # Claude Agent SDK 客户端
│   └── prompts/                # Prompt 模板
│
├── git/                  # Git 操作
│   └── GitService.ts           # blame、log、remote 等
│
├── search/               # 全局搜索
│   └── GrepEngine.ts           # grep 引擎
│
├── queue/                # 并发控制
│   └── DynamicQueue.ts         # 动态并发队列
│
├── storage/              # 结果存储
│   ├── IResultStore.ts         # 存储接口
│   └── FileResultStore.ts      # 文件系统实现
│
├── tree/                 # 调用树构建
│   └── CallTreeBuilder.ts      # 从依赖记录构建调用树
│
├── types/                # 类型定义
│   ├── config.ts               # 配置相关类型
│   └── lineage.ts              # 血缘分析核心类型
│
└── utils/
    └── findRoot.ts             # 项目根目录 / monorepo 根查找
```

## 作为库使用

```typescript
import {
  Pipeline,
  ConfigManager,
  FileResultStore,
} from '@tracking-lineage/core';

const appConfig = ConfigManager.getAppConfig(['ecom_scene_id'], '/path/to/repo');
const store = new FileResultStore(appConfig.resultDir);
const pipeline = new Pipeline(appConfig, store);

const ctx = await pipeline.run();
// ctx.stage2.pairs       — 参数变种对
// ctx.stage3.allLocations — 函数定位结果
// ctx.stage5.treesByParam — 调用树
```

## 作为 CLI 使用

```bash
# 开发模式
pnpm dev:cli -- ecom_scene_id -t /path/to/repo

# 编译后
node dist/cli.js ecom_scene_id -t /path/to/repo

# 全局安装
pnpm link --global
tracking-lineage ecom_scene_id -t /path/to/repo
```

### CLI 选项

| 选项 | 说明 |
|---|---|
| `-t, --target <dir>` | 目标 git 仓库路径（默认 cwd） |
| `-o, --output <dir>` | 结果输出目录 |
| `--from <N>` | 从第 N 阶段开始（1-5），前序从磁盘恢复 |
| `--to <N>` | 运行到第 N 阶段 |
| `--only <N>` | 只运行第 N 阶段 |
| `--debug, -d` | 打印调试信息 |

## Pipeline 阶段

| # | Stage | 输入 | 输出 |
|---|---|---|---|
| 1 | ProjectAnalyzeStage | 仓库路径 | 项目结构概览 |
| 2 | ParamVariantStage | 原始参数名 | `ParamVariantPair[]` 变种对 |
| 3 | ParamLocateStage | 变种对 | `ParamFunctionLocation[]` 函数定位 |
| 4 | DependencyGraphStage | 函数定位 | `DependencyRecord[]` 依赖图 |
| 5 | TreeAnalyzeStage | 依赖图 | `CallTree[]` 带语义分析的调用树 |

每个阶段的中间结果会持久化到 `resultDir`，支持从任意阶段断点续跑。

## 导出 API

```typescript
// 核心类
export { Pipeline, ConfigManager, FileResultStore }
export { LLMClient, AgentClient }
export { GrepEngine, GitService, DynamicQueue }
export { ProjectManager, findMethodsByLines, analyzeFunction }
export { buildFunctionCallTrees, findProjectRoot }

// 类型
export type { AppConfig, LLMConfig, ClaudeAgentConfig }
export type { PipelineContext, PipelineOptions }
export type { ParamVariantPair, FunctionLocation, CallTree, CallTreeNode, ... }
export type { IResultStore }
```

## 测试

```bash
pnpm test
```

## 环境变量

通过 `.env` 配置（查找优先级：cwd → monorepo 根 → 包根 → `~/.env.tracking-lineage`）：

| 变量 | 说明 |
|---|---|
| `LLM_BASE_URL` | LLM API 地址（Anthropic Messages 格式，不含 /v1/messages） |
| `LLM_API_KEY` | LLM API Key |
| `LLM_MODEL` | LLM 模型名 |
| `AGENT_MODEL` | Claude Agent 模型名 |
| `GRAPH_CONCURRENCY` | Stage 4 并发数（默认 5） |
| `LLM_CONCURRENCY` | LLM 调用并发数（默认 10） |
| `AGENT_CONCURRENCY` | Agent 调用并发数（默认 10） |
| `MAX_RETRIES` | 最大重试次数（默认 3） |
