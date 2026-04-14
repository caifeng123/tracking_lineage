#!/usr/bin/env node

import { existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { ConfigManager } from './config.js';
import { FileResultStore } from './storage/index.js';
import { Pipeline } from './pipeline/index.js';
import type { PipelineOptions } from './pipeline/index.js';
import { findProjectRoot } from './utils/findRoot.js';

const VERSION = '2.0.0';

const TOOL_ROOT = findProjectRoot(import.meta.url);

// ==================== 参数解析 ====================

interface CliArgs {
  rawParams: string[];
  targetDir?: string;
  resultDir?: string;
  showHelp: boolean;
  showVersion: boolean;
  // 调试选项
  fromStage?: number;
  toStage?: number;
  onlyStage?: number;
  debug: boolean;
}

function parseStageNumber(value: string): number | undefined {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1 || n > 5) return undefined;
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  const rawParams: string[] = [];
  let targetDir: string | undefined;
  let resultDir: string | undefined;
  let showHelp = false;
  let showVersion = false;
  let fromStage: number | undefined;
  let toStage: number | undefined;
  let onlyStage: number | undefined;
  let debug = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--target' || arg === '-t') && argv[i + 1]) {
      targetDir = argv[++i];
    } else if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      resultDir = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (arg === '--version' || arg === '-V') {
      showVersion = true;
    } else if ((arg === '--from' || arg === '--from-stage') && argv[i + 1]) {
      fromStage = parseStageNumber(argv[++i]);
    } else if ((arg === '--to' || arg === '--to-stage') && argv[i + 1]) {
      toStage = parseStageNumber(argv[++i]);
    } else if ((arg === '--only' || arg === '--stage') && argv[i + 1]) {
      onlyStage = parseStageNumber(argv[++i]);
    } else if (arg === '--debug' || arg === '-d') {
      debug = true;
    } else if (!arg.startsWith('-')) {
      rawParams.push(arg);
    }
  }

  if (rawParams.length === 0) {
    const envParams = process.env.RAW_PARAMS;
    if (envParams) {
      rawParams.push(...envParams.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }

  return {
    rawParams, targetDir, resultDir,
    showHelp, showVersion,
    fromStage, toStage, onlyStage, debug,
  };
}

// ==================== 帮助信息 ====================

function printHelp(): void {
  console.log(`
tracking-lineage v${VERSION}
代码参数血缘追踪工具 — 分析指定参数在整个代码仓库中的数据流向

用法:
  tracking-lineage <param1> [param2] ... [options]

选项:
  -t, --target <dir>       目标 git 仓库路径（默认当前目录）
  -o, --output <dir>       结果输出目录（默认 <工具目录>/.results/<仓库名>）
  -h, --help               显示帮助信息
  -V, --version            显示版本号

调试选项:
  --from <N>               从第 N 个阶段开始运行（1-5），前序结果从磁盘恢复
  --to <N>                 运行到第 N 个阶段结束（1-5）
  --only <N>               只运行第 N 个阶段（等价于 --from N --to N）
  --debug, -d              打印详细调试信息

  阶段编号:
    1  项目概览分析     使用 AI Agent 分析项目结构
    2  参数变种发现     识别参数的各种命名变种
    3  全局函数定位     全局搜索 + AST 精确定位
    4  依赖图构建       BFS 遍历函数调用关系
    5  调用树语义分析   AI 分析调用树语义

环境变量:
  LLM_BASE_URL             LLM API 地址
  LLM_API_KEY              LLM API Key
  LLM_MODEL                LLM 模型名
  AGENT_MODEL              Claude Agent 模型名

示例:
  tracking-lineage ecom_scene_id -t /path/to/repo
  tracking-lineage ecom_scene_id -t /path/to/repo --only 5
  tracking-lineage ecom_scene_id -t /path/to/repo --from 3
  tracking-lineage ecom_scene_id -t /path/to/repo --from 2 --to 3
  tracking-lineage ecom_scene_id -t /path/to/repo --only 4 --debug

查看分析结果请启动 Dashboard 服务:
  pnpm start    (在 monorepo 根目录)
`);
}

// ==================== 公共工具 ====================

function resolveResultDir(targetDir: string, resultDirArg?: string): string {
  if (resultDirArg) return resolve(resultDirArg);
  if (process.env.RESULT_DIR) return resolve(process.env.RESULT_DIR);
  const repoName = resolve(targetDir).split('/').pop() ?? 'unknown';
  return resolve(TOOL_ROOT, '.results', repoName);
}

function validateGitRepo(dir: string): void {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) {
    console.error(`错误: 目录不存在 "${absDir}"`);
    process.exit(1);
  }
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: absDir, stdio: 'pipe' });
  } catch {
    console.error(`错误: "${absDir}" 不是一个 git 仓库\n`);
    console.error('请 cd 到目标仓库，或通过 --target 指定路径：');
    console.error('  tracking-lineage ecom_scene_id --target /path/to/repo');
    process.exit(1);
  }
}

// ==================== 分析流程 ====================

async function runAnalyze(args: CliArgs): Promise<void> {
  const targetDir = resolve(args.targetDir ?? process.env.TARGET_DIR ?? process.cwd());
  validateGitRepo(targetDir);

  const appConfig = ConfigManager.getAppConfig(args.rawParams, targetDir);
  appConfig.resultDir = resolveResultDir(targetDir, args.resultDir);

  const pipelineOpts: PipelineOptions = {
    fromStage: args.fromStage,
    toStage: args.toStage,
    onlyStage: args.onlyStage,
    debug: args.debug,
  };

  const isPartial = args.fromStage !== undefined || args.toStage !== undefined || args.onlyStage !== undefined;

  console.log(`tracking-lineage v${VERSION}`);
  console.log(`目标仓库: ${targetDir}`);
  console.log(`追踪参数: ${args.rawParams.join(', ')}`);
  console.log(`输出目录: ${appConfig.resultDir}`);
  if (isPartial) {
    if (args.onlyStage) {
      console.log(`调试模式: 只运行 Stage ${args.onlyStage}`);
    } else {
      console.log(`调试模式: Stage ${args.fromStage ?? 1} → Stage ${args.toStage ?? 5}`);
    }
  }
  console.log('');

  const store = new FileResultStore(appConfig.resultDir);
  for (const dir of ['1-projectAnalyze', '2-aiParamVariant', '3-searchParamsFunc', '4-findCall', '5-treeAnalyze']) {
    store.ensureDir(dir);
  }

  const pipeline = new Pipeline(appConfig, store);

  try {
    const ctx = await pipeline.run(pipelineOpts);

    const stage3Count = ctx.stage3?.allLocations.length ?? 0;
    const stage5Count = ctx.stage5
      ? [...ctx.stage5.treesByParam.values()].reduce((sum, trees) => sum + trees.length, 0)
      : 0;

    console.log('\n========== 完成 ==========');
    if (ctx.stage2) console.log(`变种对数: ${ctx.stage2.pairs.length}`);
    if (ctx.stage3) console.log(`函数定位: ${stage3Count}`);
    if (ctx.stage5) console.log(`调用树数: ${stage5Count}`);
    console.log(`结果目录: ${appConfig.resultDir}`);
    console.log(`\n查看结果: pnpm start（启动 Dashboard 服务）`);
  } catch (error) {
    console.error('Pipeline 执行失败:', error);
    process.exit(1);
  }
}

// ==================== 入口 ====================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.showVersion) {
    console.log(VERSION);
    return;
  }

  if (args.showHelp || args.rawParams.length === 0) {
    printHelp();
    process.exit(args.showHelp ? 0 : 1);
  }

  await runAnalyze(args);
}

main();
