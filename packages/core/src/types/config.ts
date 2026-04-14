export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ClaudeAgentConfig {
  model: string;
  env: Record<string, string>;
}

export interface AppConfig {
  rawParams: string[];
  targetDir: string;
  businessKey: string;
  concurrency: { graphQueue: number; llmCalls: number; agentCalls: number };
  retry: { maxRetries: number; baseDelayMs: number };
  resultDir: string;
}
