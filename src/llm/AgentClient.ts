import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeAgentConfig } from '../types/index.js';

export interface AgentRunOptions { systemPrompt?: string; allowedTools?: string[]; resume?: string; [key: string]: unknown; }
export interface AgentResult { result: string; sessionId: string; }

export class AgentClient {
  private readonly config: ClaudeAgentConfig;
  private readonly defaultTools = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'];
  constructor(config: ClaudeAgentConfig) { this.config = config; }

  async run(userPrompt: string, options: AgentRunOptions = {}, maxRetries = 3): Promise<AgentResult> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try { return await this.runOnce(userPrompt, options); }
      catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt > maxRetries) break;
        console.warn(`Agent attempt ${attempt} failed, retrying: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error(`Agent failed after ${maxRetries} retries: ${lastError?.message}`);
  }

  private async runOnce(userPrompt: string, options: AgentRunOptions): Promise<AgentResult> {
    const { systemPrompt, allowedTools, ...rest } = options;
    const response = query({
      prompt: userPrompt,
      options: { systemPrompt, allowedTools: allowedTools ?? this.defaultTools, model: this.config.model, env: this.config.env, ...rest },
    });
    let result = '';
    let sessionId = '';
    for await (const message of response) {
      if (message.type === 'result') {
        sessionId = (message as { session_id?: string }).session_id ?? '';
        result += (message as { result?: string }).result ?? '';
      }
    }
    if (!result.trim()) throw new Error('Agent response empty');
    return { result, sessionId };
  }
}
