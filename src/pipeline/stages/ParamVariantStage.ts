import pLimit from 'p-limit';
import type { IResultStore } from '../../storage/index.js';
import type { AgentClient } from '../../llm/AgentClient.js';
import type { LLMClient } from '../../llm/LLMClient.js';
import { GrepEngine } from '../../search/index.js';
import {
  buildParamVariantSearchPrompt,
  buildParamVariantUserPrompt,
  buildParamRegexGenPrompt,
  buildParamRegexUserPrompt,
} from '../../llm/prompts/index.js';
import type { ParamVariantPair } from '../../types/index.js';
import type { ParamVariantResult, SingleParamVariantResult } from '../types.js';

export class ParamVariantStage {
  private readonly grep: GrepEngine;

  constructor(
    private readonly store: IResultStore,
    private readonly agent: AgentClient,
    private readonly llm: LLMClient,
    private readonly resultDir: string,
    rootDir?: string,
  ) {
    this.grep = new GrepEngine(rootDir);
  }

  async run(rawParams: string[]): Promise<ParamVariantResult> {
    console.log('[Stage2] 获取字段变种...');
    const startTime = Date.now();

    const results = await Promise.all(rawParams.map((p) => this.discoverVariants(p)));

    const pairs: ParamVariantPair[] = [];
    for (const res of results) {
      for (const match of res.matches) {
        pairs.push({ rawParam: res.rawParam, param: match });
      }
    }

    console.log(`[Stage2] 获取字段变种完成, 共 ${pairs.length} 对, 耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return { pairs };
  }

  private async discoverVariants(rawParam: string): Promise<SingleParamVariantResult> {
    const startTime = Date.now();

    const [, regexResponse] = await Promise.all([
      this.agent.run(
        buildParamVariantUserPrompt(rawParam),
        { systemPrompt: buildParamVariantSearchPrompt(rawParam, this.resultDir) },
      ),
      this.llm.query(
        buildParamRegexGenPrompt(),
        buildParamRegexUserPrompt(rawParam),
        { thinking: true },
      ),
    ]);

    const aiSearch = this.parseSafe<string[]>(
      this.store.load(`2-aiParamVariant/${rawParam}.json`),
      [],
    );

    const regexSearch = this.parseSafe<string[]>(regexResponse, []);

    const allVariants = [...aiSearch, ...regexSearch];
    const matchSet = new Set<string>();
    for (const variant of allVariants) {
      try {
        const grepResults = this.grep.searchRepo(variant);
        for (const fr of grepResults) {
          for (const m of fr.matches) {
            matchSet.add(m.match);
          }
        }
      } catch (err) {
        console.warn(`[Stage2] 正则搜索失败 "${variant}":`, err);
      }
    }

    this.store.save(
      `2-aiParamVariant/${rawParam}.json`,
      JSON.stringify(allVariants, null, 2),
    );

    const durationSec = (Date.now() - startTime) / 1000;
    console.log(`  [Stage2] ${rawParam}: AI=${aiSearch.length} 正则=${regexSearch.length} 验证匹配=${matchSet.size} (${durationSec.toFixed(1)}s)`);

    return {
      rawParam,
      aiSearch,
      regexSearch,
      matches: [...matchSet],
      durationSec,
    };
  }

  private parseSafe<T>(input: string | null, defaultValue: T): T {
    if (!input) return defaultValue;
    try {
      return JSON.parse(input) as T;
    } catch {
      console.warn('[Stage2] JSON 解析失败:', input.slice(0, 200));
      return defaultValue;
    }
  }
}
