import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import type { LLMConfig, ClaudeAgentConfig, AppConfig } from './types/index.js';
import { findProjectRoot } from './utils/findRoot.js';

// ==================== .env 查找 ====================

/** 从给定目录向上查找 pnpm-workspace.yaml，定位 monorepo 根 */
function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

// .env 查找优先级:
//   1. 当前工作目录（用户 cwd）
//   2. monorepo 根目录（向上查找 pnpm-workspace.yaml）
//   3. 包自身根目录（findProjectRoot 结果）
//   4. 用户 home 目录
const packageRoot = findProjectRoot(import.meta.url);
const monorepoRoot = findMonorepoRoot(packageRoot);

const candidates = [
  resolve(process.cwd(), '.env'),
  monorepoRoot ? resolve(monorepoRoot, '.env') : null,
  resolve(packageRoot, '.env'),
  resolve(process.env.HOME ?? '~', '.env.tracking-lineage'),
].filter(Boolean) as string[];

const envFile = candidates.find((f) => existsSync(f));
if (envFile) {
  dotenv.config({ path: envFile });
  console.log(`[config] 加载配置: ${envFile}`);
} else {
  dotenv.config(); // fallback
}

// ==================== ConfigManager ====================

export class ConfigManager {
  static getLLMConfig(): LLMConfig {
    return {
      baseUrl: process.env.LLM_BASE_URL ?? '',
      apiKey: process.env.LLM_API_KEY ?? '',
      model: process.env.LLM_MODEL ?? '',
    };
  }

  static getClaudeAgentConfig(): ClaudeAgentConfig {
    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? 'http://127.0.0.1:3456',
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '1',
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => !['NODE_OPTIONS', 'VSCODE_INSPECTOR_OPTIONS'].includes(k),
        ),
      ) as Record<string, string>,
    };
    return {
      model: process.env.AGENT_MODEL ?? 'volcengine,ep-20251013140123-55ptl',
      env,
    };
  }

  static getAppConfig(rawParams: string[], targetDir?: string): AppConfig {
    return {
      rawParams,
      targetDir: targetDir ?? process.env.TARGET_DIR ?? process.cwd(),
      businessKey: process.env.BUSINESS_KEY ?? 'unknown',
      concurrency: {
        graphQueue: parseInt(process.env.GRAPH_CONCURRENCY ?? '5', 10),
        llmCalls: parseInt(process.env.LLM_CONCURRENCY ?? '10', 10),
        agentCalls: parseInt(process.env.AGENT_CONCURRENCY ?? '10', 10),
      },
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES ?? '3', 10),
        baseDelayMs: 1000,
      },
      resultDir: process.env.RESULT_DIR ?? '',
    };
  }
}
