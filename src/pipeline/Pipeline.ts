import { resolve } from 'path';
import type { AppConfig } from '../types/index.js';
import type { IResultStore } from '../storage/index.js';
import { LLMClient, AgentClient } from '../llm/index.js';
import { ConfigManager } from '../config.js';
import { GitService } from '../git/index.js';
import {
  ProjectAnalyzeStage,
  ParamVariantStage,
  ParamLocateStage,
  DependencyGraphStage,
  TreeAnalyzeStage,
} from './stages/index.js';
import type {
  PipelineContext,
  ParamVariantResult,
  ParamLocateResult,
  DependencyGraphResult,
} from './types.js';
import type { ParamVariantPair, ParamFunctionLocation, DependencyRecord } from '../types/index.js';

export interface PipelineMetadata {
  repoName: string;
  analysisDir: string;
  commitId: string;
  rawParams: string[];
  businessKey: string;
  analyzedAt: string;
  version: string;
  status: 'running' | 'completed' | 'interrupted';
  currentStage?: string;
}

export interface PipelineOptions {
  /** 从第几个 stage 开始（1-5），默认 1 */
  fromStage?: number;
  /** 到第几个 stage 结束（1-5），默认 5 */
  toStage?: number;
  /** 只运行某个 stage，等价于 fromStage=N toStage=N */
  onlyStage?: number;
  /** 调试模式下打印更多信息 */
  debug?: boolean;
}

const STAGE_NAMES: Record<number, string> = {
  1: '项目概览分析',
  2: '参数变种发现',
  3: '全局函数定位',
  4: '依赖图构建',
  5: '调用树语义分析',
};

const STAGE_IDS: Record<number, string> = {
  1: '1-projectAnalyze',
  2: '2-paramVariant',
  3: '3-paramLocate',
  4: '4-findCall',
  5: '5-treeAnalyze',
};

export class Pipeline {
  private readonly appConfig: AppConfig;
  private readonly store: IResultStore;
  private readonly llm: LLMClient;
  private readonly agent: AgentClient;
  private metadata!: PipelineMetadata;

  constructor(appConfig: AppConfig, store: IResultStore) {
    this.appConfig = appConfig;
    this.store = store;
    this.llm = new LLMClient(ConfigManager.getLLMConfig());
    this.agent = new AgentClient(ConfigManager.getClaudeAgentConfig());
  }

  /**
   * 完整运行 Pipeline（兼容旧调用方式）
   */
  async run(options?: PipelineOptions): Promise<PipelineContext> {
    const ctx: PipelineContext = {};
    const { rawParams, businessKey, concurrency, resultDir } = this.appConfig;

    // 解析阶段范围
    let fromStage = options?.fromStage ?? 1;
    let toStage = options?.toStage ?? 5;
    if (options?.onlyStage) {
      fromStage = options.onlyStage;
      toStage = options.onlyStage;
    }
    fromStage = Math.max(1, Math.min(5, fromStage));
    toStage = Math.max(fromStage, Math.min(5, toStage));

    const isPartial = fromStage > 1 || toStage < 5;
    const debug = options?.debug ?? false;

    if (isPartial) {
      console.log('========== Pipeline 调试模式 ==========');
      console.log(`运行范围: Stage ${fromStage} → Stage ${toStage}`);
      console.log(`参数: ${rawParams.join(', ')}`);
      if (fromStage > 1) {
        console.log(`⚠ 将从磁盘恢复 Stage 1~${fromStage - 1} 的中间结果`);
      }
    } else {
      console.log('========== Pipeline 开始 ==========');
      console.log(`参数: ${rawParams.join(', ')}`);
    }

    const startTime = Date.now();

    // 启动时立即写入 metadata
    this.initMetadata();

    // ---- Stage 1: 项目概览 ----
    if (fromStage <= 1 && toStage >= 1) {
      this.updateStage('1-projectAnalyze');
      const stage1 = new ProjectAnalyzeStage(this.store, this.agent, resultDir);
      ctx.stage1 = await stage1.run();
    } else if (debug) {
      console.log(`[跳过] Stage 1: ${STAGE_NAMES[1]}`);
    }

    // ---- Stage 2: 参数变种发现 ----
    if (fromStage <= 2 && toStage >= 2) {
      this.updateStage('2-paramVariant');
      const stage2 = new ParamVariantStage(
        this.store, this.agent, this.llm,
        resultDir, this.appConfig.targetDir,
      );
      ctx.stage2 = await stage2.run(rawParams);
    } else if (toStage >= 3 || fromStage > 2) {
      // 需要恢复 Stage 2 结果供后续阶段使用
      if (fromStage > 2) {
        console.log(`[恢复] Stage 2: 从磁盘加载参数变种...`);
        ctx.stage2 = this.restoreStage2(rawParams);
        if (ctx.stage2) {
          console.log(`  → 恢复 ${ctx.stage2.pairs.length} 个变种对`);
        } else {
          console.error('  ✗ 无法恢复 Stage 2 结果，请先运行 Stage 2');
          throw new Error('Stage 2 结果不存在，无法从 Stage ' + fromStage + ' 开始');
        }
      }
    }

    // ---- Stage 3: 全局函数定位 ----
    if (fromStage <= 3 && toStage >= 3) {
      if (!ctx.stage2) {
        console.log(`[恢复] Stage 2: 从磁盘加载参数变种...`);
        ctx.stage2 = this.restoreStage2(rawParams);
        if (!ctx.stage2) throw new Error('Stage 2 结果不存在，无法运行 Stage 3');
        console.log(`  → 恢复 ${ctx.stage2.pairs.length} 个变种对`);
      }
      this.updateStage('3-paramLocate');
      const stage3 = new ParamLocateStage(this.store, businessKey, this.appConfig.targetDir);
      ctx.stage3 = stage3.run(ctx.stage2.pairs);
    } else if (fromStage > 3) {
      // 需要恢复 Stage 3 结果
      console.log(`[恢复] Stage 3: 从磁盘加载函数定位...`);
      ctx.stage3 = this.restoreStage3(rawParams);
      if (ctx.stage3) {
        console.log(`  → 恢复 ${ctx.stage3.allLocations.length} 个函数定位`);
      } else {
        console.error('  ✗ 无法恢复 Stage 3 结果，请先运行 Stage 3');
        throw new Error('Stage 3 结果不存在，无法从 Stage ' + fromStage + ' 开始');
      }
    }

    if (ctx.stage3 && ctx.stage3.allLocations.length === 0 && toStage >= 4) {
      console.log('[Pipeline] 未找到任何参数位置，提前结束');
      this.finalizeMetadata('completed');
      return ctx;
    }

    // ---- Stage 4: BFS 依赖图构建 ----
    if (fromStage <= 4 && toStage >= 4) {
      if (!ctx.stage3) {
        console.log(`[恢复] Stage 3: 从磁盘加载函数定位...`);
        ctx.stage3 = this.restoreStage3(rawParams);
        if (!ctx.stage3 || ctx.stage3.allLocations.length === 0) throw new Error('Stage 3 结果不存在或为空，无法运行 Stage 4');
        console.log(`  → 恢复 ${ctx.stage3.allLocations.length} 个函数定位`);
      }
      this.updateStage('4-findCall');
      const stage4 = new DependencyGraphStage(
        this.store,
        this.llm,
        concurrency.graphQueue,
        this.appConfig.retry.maxRetries,
      );
      ctx.stage4 = await stage4.run(ctx.stage3.allLocations);
    } else if (fromStage > 4) {
      // 需要恢复 Stage 4 结果
      console.log(`[恢复] Stage 4: 从磁盘加载依赖图...`);
      ctx.stage4 = this.restoreStage4(rawParams);
      if (ctx.stage4) {
        const totalRecords = [...ctx.stage4.recordsByParam.values()].reduce((s, r) => s + r.length, 0);
        console.log(`  → 恢复 ${totalRecords} 条依赖记录`);
      } else {
        console.error('  ✗ 无法恢复 Stage 4 结果，请先运行 Stage 4');
        throw new Error('Stage 4 结果不存在，无法从 Stage ' + fromStage + ' 开始');
      }
    }

    // ---- Stage 5: 调用树语义分析 ----
    if (fromStage <= 5 && toStage >= 5) {
      if (!ctx.stage4) {
        console.log(`[恢复] Stage 4: 从磁盘加载依赖图...`);
        ctx.stage4 = this.restoreStage4(rawParams);
        if (!ctx.stage4) throw new Error('Stage 4 结果不存在，无法运行 Stage 5');
        const totalRecords = [...ctx.stage4.recordsByParam.values()].reduce((s, r) => s + r.length, 0);
        console.log(`  → 恢复 ${totalRecords} 条依赖记录`);
      }
      this.updateStage('5-treeAnalyze');
      const stage5 = new TreeAnalyzeStage(
        this.store,
        this.agent,
        concurrency.agentCalls,
      );
      ctx.stage5 = await stage5.run(ctx.stage4.recordsByParam, rawParams);
    }

    // 最终更新 metadata
    this.finalizeMetadata('completed');

    const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
    if (isPartial) {
      console.log(`========== 调试运行完成 (Stage ${fromStage}→${toStage}), 耗时: ${totalSec}s ==========`);
    } else {
      console.log(`========== Pipeline 完成, 总耗时: ${totalSec}s ==========`);
    }
    return ctx;
  }

  // ==================== 中间结果恢复 ====================

  /**
   * 从磁盘恢复 Stage 2 的结果：读取 2-aiParamVariant/{param}.json 并重新做 grep 验证
   */
  private restoreStage2(rawParams: string[]): ParamVariantResult | undefined {
    const pairs: ParamVariantPair[] = [];
    let hasAny = false;

    for (const rawParam of rawParams) {
      const key = `2-aiParamVariant/${rawParam}.json`;
      if (!this.store.exists(key)) continue;
      hasAny = true;

      const content = this.store.load(key);
      if (!content) continue;

      try {
        const variants: string[] = JSON.parse(content);
        // 直接用存储的变种作为 pair（与原 Stage 实际 grep 结果一致）
        for (const variant of variants) {
          pairs.push({ rawParam, param: variant });
        }
      } catch {
        console.warn(`  ⚠ 解析 ${key} 失败`);
      }
    }

    return hasAny ? { pairs } : undefined;
  }

  /**
   * 从磁盘恢复 Stage 3 的结果：读取 3-searchParamsFunc/{rawParam}/{param}.json
   */
  private restoreStage3(rawParams: string[]): ParamLocateResult | undefined {
    const locationsByParam = new Map<string, ParamFunctionLocation[]>();
    const allLocations: ParamFunctionLocation[] = [];
    let hasAny = false;

    for (const rawParam of rawParams) {
      const dir = `3-searchParamsFunc/${rawParam}`;
      let files: string[];
      try {
        files = this.store.list(dir).filter(f => f.endsWith('.json'));
      } catch {
        continue;
      }
      if (files.length === 0) continue;
      hasAny = true;

      const paramLocations: ParamFunctionLocation[] = [];
      for (const file of files) {
        const content = this.store.load(`${dir}/${file}`);
        if (!content) continue;
        try {
          const locations: ParamFunctionLocation[] = JSON.parse(content);
          paramLocations.push(...locations);
        } catch {
          console.warn(`  ⚠ 解析 ${dir}/${file} 失败`);
        }
      }

      locationsByParam.set(rawParam, paramLocations);
      allLocations.push(...paramLocations);
    }

    return hasAny ? { locationsByParam, allLocations } : undefined;
  }

  /**
   * 从磁盘恢复 Stage 4 的结果：读取 4-findCall/{rawParam}/*.jsonl
   */
  private restoreStage4(rawParams: string[]): DependencyGraphResult | undefined {
    const recordsByParam = new Map<string, DependencyRecord[]>();
    let hasAny = false;

    for (const rawParam of rawParams) {
      const dir = `4-findCall/${rawParam}`;
      let files: string[];
      try {
        files = this.store.list(dir).filter(f => f.endsWith('.jsonl'));
      } catch {
        continue;
      }
      if (files.length === 0) continue;
      hasAny = true;

      const records: DependencyRecord[] = [];
      for (const file of files) {
        const content = this.store.load(`${dir}/${file}`);
        if (!content) continue;
        for (const line of content.split('\n').filter(l => l.trim())) {
          try {
            records.push(JSON.parse(line) as DependencyRecord);
          } catch { /* skip */ }
        }
      }
      recordsByParam.set(rawParam, records);
    }

    return hasAny ? { recordsByParam } : undefined;
  }

  // ==================== Metadata 管理 ====================

  private initMetadata(): void {
    const git = new GitService(this.appConfig.targetDir);
    this.metadata = {
      repoName: git.getRepoName() || resolve(this.appConfig.targetDir).split('/').pop() || 'unknown',
      analysisDir: resolve(this.appConfig.targetDir),
      commitId: git.getCurrentCommitId(),
      rawParams: this.appConfig.rawParams,
      businessKey: this.appConfig.businessKey,
      analyzedAt: new Date().toISOString(),
      version: '2.0.0',
      status: 'running',
      currentStage: 'init',
    };
    this.saveMetadata();
    console.log(`[Pipeline] metadata 已初始化`);
  }

  private updateStage(stage: string): void {
    this.metadata.currentStage = stage;
    this.saveMetadata();
  }

  private finalizeMetadata(status: 'completed' | 'interrupted'): void {
    this.metadata.status = status;
    this.metadata.analyzedAt = new Date().toISOString();
    delete this.metadata.currentStage;
    this.saveMetadata();
    console.log(`[Pipeline] metadata 已保存 (${status})`);
  }

  private saveMetadata(): void {
    this.store.save('metadata.json', JSON.stringify(this.metadata, null, 2));
  }
}
