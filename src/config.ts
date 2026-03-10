import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LLMConfig, ClaudeAgentConfig, AppConfig } from './types/index.js';

// .env 查找优先级: 当前工作目录 > 工具安装目录 > 用户 home 目录
const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(__dirname, '..');
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(toolRoot, '.env'),
  resolve(process.env.HOME ?? '~', '.env.tracking-lineage'),
];
const envFile = candidates.find((f) => existsSync(f));
if (envFile) {
  dotenv.config({ path: envFile });
  console.log(`[config] 加载配置: ${envFile}`);
} else {
  dotenv.config(); // fallback
}

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
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? '',
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '1',
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => !['NODE_OPTIONS', 'VSCODE_INSPECTOR_OPTIONS'].includes(k),
        ),
      ) as Record<string, string>,
    };
    return {
      model: process.env.AGENT_MODEL ?? '',
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
