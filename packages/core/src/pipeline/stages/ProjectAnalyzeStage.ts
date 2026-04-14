import type { IResultStore } from '../../storage/index.js';
import type { AgentClient } from '../../llm/index.js';
import { buildProjectAnalyzePrompt } from '../../llm/prompts/index.js';
import type { ProjectAnalyzeResult } from '../types.js';

const OVERVIEW_KEY = '1-projectAnalyze/overview.md';

export class ProjectAnalyzeStage {
  constructor(
    private readonly store: IResultStore,
    private readonly agent: AgentClient,
    private readonly resultDir: string,
  ) {}

  async run(): Promise<ProjectAnalyzeResult> {
    if (this.store.exists(OVERVIEW_KEY)) {
      console.log('[Stage1] 项目概览已存在，跳过');
      return { overviewPath: OVERVIEW_KEY };
    }

    console.log('[Stage1] 生成项目概览...');
    const startTime = Date.now();

    await this.agent.run(buildProjectAnalyzePrompt(this.resultDir));

    console.log(`[Stage1] 项目概览生成完成, 耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return { overviewPath: OVERVIEW_KEY };
  }
}
