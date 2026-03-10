import { readFileSync } from 'fs';
import pLimit from 'p-limit';
import type { IResultStore } from '../../storage/index.js';
import type { LLMClient } from '../../llm/LLMClient.js';
import { DynamicQueue } from '../../queue/index.js';
import { analyzeFunction } from '../../ast/index.js';
import {
  buildFunctionAnalysisPrompt,
  buildCallsOnlyPrompt,
} from '../../llm/prompts/index.js';
import type {
  ParamFunctionLocation,
  GraphTask,
  DependencyRecord,
  AnalyzedParam,
  AnalyzedCall,
  AnalyzedReferenceParam,
  LLMFunctionAnalysisResult,
} from '../../types/index.js';
import type { DependencyGraphResult } from '../types.js';

export class DependencyGraphStage {
  constructor(
    private readonly store: IResultStore,
    private readonly llm: LLMClient,
    private readonly concurrency: number = 5,
    private readonly maxRetries: number = 3,
  ) {}

  async run(allLocations: ParamFunctionLocation[]): Promise<DependencyGraphResult> {
    console.log(`[Stage4] 构建依赖图, ${allLocations.length} 个初始任务...`);
    const startTime = Date.now();

    // 将 ParamFunctionLocation[] 转为 GraphTask[]
    const initialTasks: GraphTask[] = allLocations.map((loc) => ({
      absolutePath: loc.filePath,
      startLine: loc.startLine,
      endLine: loc.endLine,
      functionName: loc.functionName,
      param: loc.param,
      rawParam: loc.rawParam,
      analyzeCall: false,
    }));

    const queue = new DynamicQueue<GraphTask>(
      this.concurrency,
      this.maxRetries,
      (task) => `${task.absolutePath}:${task.startLine}:${task.param}:${task.analyzeCall}`,
    );

    queue.addTasks(initialTasks);

    const stats = await queue.start((task) => this.processTask(task));
    console.log(`[Stage4] 依赖图构建完成, completed=${stats.completed} failed=${stats.failed}, 耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    // 从存储中读取所有记录，按 rawParam 分组
    const recordsByParam = new Map<string, DependencyRecord[]>();
    const rawParams = new Set(allLocations.map((l) => l.rawParam));

    for (const rawParam of rawParams) {
      const dir = `4-findCall/${rawParam}`;
      const files = this.store.list(dir).filter((f) => f.endsWith('.jsonl'));
      const records: DependencyRecord[] = [];
      for (const file of files) {
        const content = this.store.load(`${dir}/${file}`);
        if (!content) continue;
        for (const line of content.split('\n').filter((l) => l.trim())) {
          try {
            records.push(JSON.parse(line) as DependencyRecord);
          } catch { /* skip malformed */ }
        }
      }
      recordsByParam.set(rawParam, records);
    }

    return { recordsByParam };
  }

  private async processTask(task: GraphTask): Promise<{ dependentTasks?: GraphTask[] }> {
    const { absolutePath, startLine, endLine, functionName, param, rawParam, analyzeCall } = task;

    // 1. 读取源码
    const rawCode = this.getRawCode(absolutePath, startLine, endLine);

    // 2. AST 分析: 引用 + 调用
    const { calls, references } = analyzeFunction(absolutePath, startLine);

    // 3. LLM 分析参数使用
    const prompt = analyzeCall
      ? buildCallsOnlyPrompt({ param, calls })
      : buildFunctionAnalysisPrompt({ param, calls });

    const llmResponse = await this.llm.query(prompt, rawCode);
    const parsed = this.parseSafe<LLMFunctionAnalysisResult>(llmResponse, {});

    const llmCalls = (parsed.calls ?? [])
      .map(({ function_name, params = [] }) => {
        const filtered = params.filter((p) => p.use);
        if (filtered.length === 0) return null;
        return { function_name, params: filtered };
      })
      .filter(Boolean) as Array<{ function_name: string; params: AnalyzedParam[] }>;

    const referenceParams = (parsed.reference_params ?? []).filter((p) => p.use);

    // 4. 收集依赖任务
    const dependentTasks: GraphTask[] = [];

    // 向上追踪: 如果有引用参数且不是纯调用分析模式
    if (referenceParams.length > 0 && !analyzeCall) {
      const paramInfo = referenceParams
        .map((item) => {
          const subParam = item.name.split('.').slice(1).join('.');
          return `第${item.index + 1}个参数${subParam ? `下的${subParam}` : ''}`;
        })
        .join('，');

      for (const ref of references) {
        dependentTasks.push({
          param: `${ref.callFunctionName}函数的${paramInfo}`,
          absolutePath: ref.absolutePath,
          startLine: ref.startLine,
          endLine: ref.endLine,
          functionName: ref.functionName,
          rawParam,
          analyzeCall: false,
        });
      }
    }

    // 向下追踪: 合并 LLM 调用信息和 AST 调用信息
    const callsWithDetail: AnalyzedCall[] = llmCalls
      .map(({ function_name, params }) => {
        const astCall = calls.find((c) => c.functionName === function_name);
        if (!astCall) return null;
        return { ...astCall, params } as AnalyzedCall;
      })
      .filter(Boolean) as AnalyzedCall[];

    if (callsWithDetail.length > 0) {
      for (const call of callsWithDetail) {
        const paramDesc = call.params
          .map((p) => `第${p.index + 1}个参数${p.name}`)
          .join('，');
        dependentTasks.push({
          param: `${call.functionName}函数的${paramDesc}`,
          absolutePath: call.absolutePath,
          startLine: call.startLine,
          endLine: call.endLine,
          functionName: call.functionName,
          rawParam,
          analyzeCall: true,
        });
      }
    }

    // 5. 保存记录
    this.store.ensureDir(`4-findCall/${rawParam}`);
    const record: DependencyRecord = {
      param,
      absolutePath,
      startLine,
      endLine,
      functionName,
      calls: callsWithDetail,
    };
    this.store.append(
      `4-findCall/${rawParam}/${rawParam}.jsonl`,
      JSON.stringify(record) + '\n',
    );

    return { dependentTasks };
  }

  private getRawCode(absolutePath: string, startLine: number, endLine: number): string {
    try {
      const lines = readFileSync(absolutePath, 'utf-8').split('\n');
      return lines.slice(startLine - 1, endLine).join('\n');
    } catch {
      return '';
    }
  }

  private parseSafe<T>(input: string | null, defaultValue: T): T {
    if (!input) return defaultValue;
    try {
      return JSON.parse(input) as T;
    } catch {
      console.warn('[Stage4] JSON 解析失败:', input.slice(0, 200));
      return defaultValue;
    }
  }
}
