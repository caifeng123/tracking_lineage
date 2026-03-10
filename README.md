# tracking-lineage

代码参数血缘追踪工具 — 分析指定参数在整个代码仓库中的数据流向。

通过 AST 静态分析 + LLM 语义理解，自动构建参数的完整调用链路图。

## 安装

```bash
# 克隆项目
git clone <repo-url>
cd tracking-lineage

# 安装依赖
npm install

# 构建
npm run build

# link 到全局
npm link
```

完成后即可在任意目录使用 `tracking-lineage` 命令。

修改源码后只需重新 `npm run build`，无需再次 link。

```bash
# 取消全局 link
npm unlink -g tracking-lineage
```

## 使用

```bash
# cd 到目标仓库后直接运行
cd /path/to/your/repo
tracking-lineage ecom_scene_id

# 追踪多个参数
tracking-lineage ecom_scene_id recommend_info

# 指定目标仓库
tracking-lineage ecom_scene_id --target /path/to/repo

# 自定义输出目录
tracking-lineage ecom_scene_id -o ./my-results
```

## 参数与选项

| 参数/选项 | 说明 |
|---|---|
| `<param>` | 要追踪的参数名（至少一个） |
| `-t, --target <dir>` | 目标 git 仓库路径（默认当前目录） |
| `-o, --output <dir>` | 结果输出目录（默认 `./.result`） |
| `-h, --help` | 显示帮助信息 |
| `-V, --version` | 显示版本号 |

## 环境变量

在**目标仓库根目录**创建 `.env` 文件（或在 shell 中 export）：

```env
# LLM 配置（单轮调用）
LLM_BASE_URL=https://your-llm-api.com/v1/chat/completions
LLM_API_KEY=your-api-key
LLM_MODEL=your-model-name

# Claude Agent 配置（多轮调用）
AGENT_MODEL=your-agent-model
ANTHROPIC_BASE_URL=http://127.0.0.1:3456
ANTHROPIC_AUTH_TOKEN=your-token

# 业务配置
BUSINESS_KEY=your-business
GRAPH_CONCURRENCY=5
LLM_CONCURRENCY=10
AGENT_CONCURRENCY=10
```

## 工作流程

1. **项目概览** — Agent 自动阅读仓库代码，生成项目结构概览
2. **参数变种发现** — AI 搜索 + 正则生成 + Grep 验证，找到参数的所有命名变体
3. **全局定位** — Grep 全局搜索 + AST 解析定位到具体函数 + Git blame 信息
4. **依赖图构建** — BFS 并发遍历，LLM 分析每个函数中参数的上下游关系
5. **调用树分析** — 构建完整调用树，Agent 生成语义化的血缘分析报告

## 编程式调用

```typescript
import { Pipeline, ConfigManager, FileResultStore } from 'tracking-lineage';

const appConfig = ConfigManager.getAppConfig(['ecom_scene_id'], '/path/to/repo');
const store = new FileResultStore(appConfig.resultDir);
const pipeline = new Pipeline(appConfig, store);
const result = await pipeline.run();
```

## 开发

```bash
# 开发模式（免构建直接运行）
npm run dev -- ecom_scene_id --target /path/to/repo

# 运行测试
npm test

# 构建
npm run build
```

## License

MIT
