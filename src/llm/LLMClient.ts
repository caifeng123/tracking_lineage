import type { LLMConfig } from '../types/index.js';

export interface SingleQueryOptions { thinking?: boolean; jsonFormat?: boolean; }

export class LLMClient {
  private readonly config: LLMConfig;
  constructor(config: LLMConfig) { this.config = config; }

  async query(systemPrompt: string, userPrompt: string, options: SingleQueryOptions = {}): Promise<string> {
    const { thinking = false, jsonFormat = true } = options;
    const response = await fetch(this.config.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        ...(thinking && { thinking: { type: 'enabled' } }),
        ...(jsonFormat && { response_format: { type: 'json_object' } }),
      }),
    });
    if (!response.ok) throw new Error(`LLM API failed: ${response.status} ${response.statusText}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error(`LLM response format error: ${JSON.stringify(data)}`);
    return content;
  }
}
