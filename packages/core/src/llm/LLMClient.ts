import type { LLMConfig } from '../types/index.js';

export interface SingleQueryOptions {
  thinking?: boolean;
  jsonFormat?: boolean;
  maxTokens?: number;
}

type ApiFormat = 'anthropic' | 'openai';

/**
 * LLM 客户端 — 自动检测 Anthropic / OpenAI 接口格式
 *
 * 判断规则:
 *   - baseUrl 包含 "/messages" → Anthropic Messages API（流式 SSE）
 *   - 否则                     → OpenAI Chat Completions API
 *
 * baseUrl 均由用户配置完整路径，不做自动拼接:
 *   - Anthropic: https://llmbox.bytedance.net/v1/messages
 *   - OpenAI:    https://api.openai.com/v1/chat/completions
 */
export class LLMClient {
  private readonly config: LLMConfig;
  private readonly format: ApiFormat;

  constructor(config: LLMConfig) {
    this.config = config;
    this.format = LLMClient.detectFormat(config.baseUrl);
  }

  /** 根据 baseUrl 判断接口格式 */
  private static detectFormat(baseUrl: string): ApiFormat {
    const normalized = baseUrl.replace(/\/+$/, '');
    if (/\/messages\b/.test(normalized)) {
      return 'anthropic';
    }
    return 'openai';
  }

  async query(
    systemPrompt: string,
    userPrompt: string,
    options: SingleQueryOptions = {},
  ): Promise<string> {
    return this.format === 'anthropic'
      ? this.queryAnthropic(systemPrompt, userPrompt, options)
      : this.queryOpenAI(systemPrompt, userPrompt, options);
  }

  // ───────────── Anthropic Messages API (streaming SSE) ─────────────

  private async queryAnthropic(
    systemPrompt: string,
    userPrompt: string,
    options: SingleQueryOptions,
  ): Promise<string> {
    const { thinking = false, maxTokens = 8192 } = options;

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: maxTokens,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };

    if (thinking) {
      body.thinking = { type: 'enabled', budget_tokens: Math.min(maxTokens, 4096) };
    }

    const url = this.config.baseUrl.replace(/\/+$/, '');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`LLM API failed [Anthropic]: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return this.consumeAnthropicStream(response);
  }

  /**
   * 消费 Anthropic SSE 流，拼接 text_delta 事件中的文本
   */
  private async consumeAnthropicStream(response: Response): Promise<string> {
    const body = response.body;
    if (!body) throw new Error('Response body is null');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              chunks.push(event.delta.text);
            }

            // 非流式兜底
            if (event.type === 'message' && Array.isArray(event.content)) {
              const text = event.content
                .filter((b: { type: string }) => b.type === 'text')
                .map((b: { text: string }) => b.text)
                .join('');
              if (text) return text;
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const result = chunks.join('');
    if (!result) {
      throw new Error('LLM returned empty response (no text_delta events received)');
    }
    return result;
  }

  // ───────────── OpenAI Chat Completions API ─────────────

  private async queryOpenAI(
    systemPrompt: string,
    userPrompt: string,
    options: SingleQueryOptions,
  ): Promise<string> {
    const { thinking = false, jsonFormat = false, maxTokens = 8192 } = options;

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };

    if (thinking) {
      body.thinking = { type: 'enabled' };
    }
    if (jsonFormat) {
      body.response_format = { type: 'json_object' };
    }

    const url = this.config.baseUrl.replace(/\/+$/, '');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`LLM API failed [OpenAI]: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned empty response (no choices[0].message.content)');
    }
    return content;
  }
}
