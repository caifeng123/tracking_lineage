import pLimit from 'p-limit';
import type { IResultStore } from '../../storage/index.js';
import type { AgentClient } from '../../llm/AgentClient.js';
import { buildFunctionCallTrees } from '../../tree/index.js';
import {
  buildTreeAnalysisSystemPrompt,
  buildTreeAnalysisUserPrompt,
} from '../../llm/prompts/index.js';
import type { DependencyRecord, CallTree } from '../../types/index.js';
import type { TreeAnalyzeResult } from '../types.js';

export interface AnalyzedTree extends CallTree {
  summary: string;
}

export class TreeAnalyzeStage {
  constructor(
    private readonly store: IResultStore,
    private readonly agent: AgentClient,
    private readonly agentConcurrency: number = 10,
  ) {}

  async run(
    recordsByParam: Map<string, DependencyRecord[]>,
    rawParams: string[],
  ): Promise<TreeAnalyzeResult> {
    console.log('[Stage5] 分析函数调用树...');
    const startTime = Date.now();

    const treesByParam = new Map<string, AnalyzedTree[]>();

    for (const rawParam of rawParams) {
      const records = recordsByParam.get(rawParam);
      if (!records || records.length === 0) {
        console.log(`  [Stage5] ${rawParam}: 无依赖记录，跳过`);
        continue;
      }

      const trees = buildFunctionCallTrees(records);
      if (trees.length === 0) {
        console.log(`  [Stage5] ${rawParam}: 无调用树，跳过`);
        continue;
      }

      const analyzed = await this.analyzeTrees(rawParam, rawParam, trees);
      treesByParam.set(rawParam, analyzed);
    }

    console.log(`[Stage5] 调用树分析完成, 耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return { treesByParam };
  }

  private async analyzeTrees(
    rawParam: string,
    param: string,
    trees: CallTree[],
  ): Promise<AnalyzedTree[]> {
    const limit = pLimit(this.agentConcurrency);
    this.store.ensureDir(`5-treeAnalyze/${rawParam}`);

    const results = await Promise.all(
      trees.map((tree) =>
        limit(async () => {
          const agentResult = await this.agent.run(
            buildTreeAnalysisUserPrompt(tree.treeStrLLM),
            { systemPrompt: buildTreeAnalysisSystemPrompt(param) },
          );

          const summary = `## 函数调用树\n\`\`\`\n${tree.treeStrRead}\n\`\`\`\n${agentResult.result}`;

          const analyzed: AnalyzedTree = { ...tree, summary };

          // 追加写入
          this.store.append(
            `5-treeAnalyze/${rawParam}/${param}.jsonl`,
            JSON.stringify(analyzed) + '\n',
          );

          return analyzed;
        }),
      ),
    );

    return results;
  }
}
