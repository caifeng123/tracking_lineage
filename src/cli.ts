#!/usr/bin/env node

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync } from 'child_process';
import { ConfigManager } from './config.js';
import { FileResultStore } from './storage/index.js';
import { Pipeline } from './pipeline/index.js';

const VERSION = '2.0.0';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ==================== 参数解析 ====================

interface BaseArgs {
  targetDir?: string;
  resultDir?: string;
  showHelp: boolean;
  showVersion: boolean;
}

interface AnalyzeArgs extends BaseArgs {
  command: 'analyze';
  rawParams: string[];
}

interface ServeArgs extends BaseArgs {
  command: 'serve';
  port: number;
  noOpen: boolean;
}

type CliArgs = AnalyzeArgs | ServeArgs;

function parseArgs(argv: string[]): CliArgs {
  const rawParams: string[] = [];
  let targetDir: string | undefined;
  let resultDir: string | undefined;
  let showHelp = false;
  let showVersion = false;
  let command: 'analyze' | 'serve' = 'analyze';
  let port = 3000;
  let noOpen = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'serve') {
      command = 'serve';
    } else if ((arg === '--target' || arg === '-t') && argv[i + 1]) {
      targetDir = argv[++i];
    } else if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      resultDir = argv[++i];
    } else if ((arg === '--port' || arg === '-p') && argv[i + 1]) {
      port = parseInt(argv[++i], 10) || 3000;
    } else if (arg === '--no-open') {
      noOpen = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (arg === '--version' || arg === '-V') {
      showVersion = true;
    } else if (!arg.startsWith('-')) {
      rawParams.push(arg);
    }
  }

  if (rawParams.length === 0 && command === 'analyze') {
    const envParams = process.env.RAW_PARAMS;
    if (envParams) {
      rawParams.push(...envParams.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }

  if (command === 'serve') {
    return { command, targetDir, resultDir, showHelp, showVersion, port, noOpen };
  }
  return { command, rawParams, targetDir, resultDir, showHelp, showVersion };
}

// ==================== 帮助信息 ====================

function printHelp(command?: string): void {
  if (command === 'serve') {
    console.log(`
tracking-lineage serve v${VERSION}
启动可视化服务，查看分析结果

用法:
  tracking-lineage serve [options]

选项:
  -t, --target <dir>       目标 git 仓库路径（默认当前目录）
  -o, --output <dir>       结果目录（默认自动检测）
  -p, --port <port>        服务端口（默认 3000）
  --no-open                不自动打开浏览器
  -h, --help               显示帮助信息

示例:
  # 在目标仓库中启动
  cd /path/to/repo
  tracking-lineage serve

  # 指定仓库和端口
  tracking-lineage serve -t /path/to/repo -p 8080
`);
    return;
  }

  console.log(`
tracking-lineage v${VERSION}
代码参数血缘追踪工具 — 分析指定参数在整个代码仓库中的数据流向

用法:
  tracking-lineage <param1> [param2] ... [options]
  tracking-lineage serve [options]

命令:
  <param>                  分析模式 — 追踪指定参数
  serve                    启动可视化服务查看结果

选项:
  -t, --target <dir>       目标 git 仓库路径（默认当前目录）
  -o, --output <dir>       结果输出目录（默认 <工具目录>/.results/<仓库名>）
  -h, --help               显示帮助信息
  -V, --version            显示版本号

分析模式选项:
  LLM_BASE_URL             LLM API 地址
  LLM_API_KEY              LLM API Key
  LLM_MODEL                LLM 模型名
  AGENT_MODEL              Claude Agent 模型名

可视化选项:
  -p, --port <port>        服务端口（默认 3000）
  --no-open                不自动打开浏览器

示例:
  tracking-lineage ecom_scene_id -t /path/to/repo
  tracking-lineage serve -t /path/to/repo -p 8080
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

// ==================== 分析模式 ====================

async function runAnalyze(args: AnalyzeArgs): Promise<void> {
  if (args.showHelp || args.rawParams.length === 0) {
    printHelp();
    process.exit(args.showHelp ? 0 : 1);
  }

  const targetDir = resolve(args.targetDir ?? process.env.TARGET_DIR ?? process.cwd());
  validateGitRepo(targetDir);

  const appConfig = ConfigManager.getAppConfig(args.rawParams, targetDir);
  appConfig.resultDir = resolveResultDir(targetDir, args.resultDir);

  // 不切换 cwd — 所有路径通过 targetDir/resultDir 绝对路径传递
  console.log(`tracking-lineage v${VERSION}`);
  console.log(`目标仓库: ${targetDir}`);
  console.log(`追踪参数: ${args.rawParams.join(', ')}`);
  console.log(`输出目录: ${appConfig.resultDir}`);
  console.log('');

  const store = new FileResultStore(appConfig.resultDir);
  for (const dir of ['1-projectAnalyze', '2-aiParamVariant', '3-searchParamsFunc', '4-findCall', '5-treeAnalyze']) {
    store.ensureDir(dir);
  }

  const pipeline = new Pipeline(appConfig, store);

  try {
    const ctx = await pipeline.run();

    const stage3Count = ctx.stage3?.allLocations.length ?? 0;
    const stage5Count = ctx.stage5
      ? [...ctx.stage5.treesByParam.values()].reduce((sum, trees) => sum + trees.length, 0)
      : 0;

    console.log('\n========== 完成 ==========');
    console.log(`变种对数: ${ctx.stage2?.pairs.length ?? 0}`);
    console.log(`函数定位: ${stage3Count}`);
    console.log(`调用树数: ${stage5Count}`);
    console.log(`结果目录: ${appConfig.resultDir}`);
    console.log(`\n查看结果: tracking-lineage serve -t ${targetDir}`);
  } catch (error) {
    console.error('Pipeline 执行失败:', error);
    process.exit(1);
  }
}

// ==================== 可视化模式 ====================

async function runServe(args: ServeArgs): Promise<void> {
  if (args.showHelp) {
    printHelp('serve');
    process.exit(0);
  }

  const targetDir = resolve(args.targetDir ?? process.env.TARGET_DIR ?? process.cwd());
  validateGitRepo(targetDir);

  const resultDir = resolveResultDir(targetDir, args.resultDir);

  if (!existsSync(resultDir)) {
    console.error(`错误: 结果目录不存在 "${resultDir}"`);
    console.error('请先运行分析: tracking-lineage <param> -t ' + targetDir);
    process.exit(1);
  }

  // 检查是否有分析结果
  const metadataPath = resolve(resultDir, 'metadata.json');
  if (!existsSync(metadataPath)) {
    console.error(`错误: 未找到分析结果 (${metadataPath})`);
    console.error('请先运行分析: tracking-lineage <param> -t ' + targetDir);
    process.exit(1);
  }

  const { startServer } = await import('../server/index.js');
  startServer({
    targetDir,
    resultDir,
    port: args.port,
    open: !args.noOpen,
  });
}

// ==================== 入口 ====================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.showVersion) {
    console.log(VERSION);
    return;
  }

  if (args.command === 'serve') {
    await runServe(args);
  } else {
    await runAnalyze(args);
  }
}

main();
