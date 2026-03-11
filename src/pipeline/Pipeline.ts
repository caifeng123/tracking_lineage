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
import type { PipelineContext } from './types.js';

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

  async run(): Promise<PipelineContext> {
    const ctx: PipelineContext = {};
    const { rawParams, businessKey, concurrency, resultDir } = this.appConfig;

    console.log('========== Pipeline 开始 ==========');
    console.log(`参数: ${rawParams.join(', ')}`);
    const startTime = Date.now();

    // 启动时立即写入 metadata，确保即使中断也有基础信息
    this.initMetadata();

    // Stage 1: 项目概览 — 传入 resultDir 绝对路径
    this.updateStage('1-projectAnalyze');
    const stage1 = new ProjectAnalyzeStage(this.store, this.agent, resultDir);
    ctx.stage1 = await stage1.run();

    // Stage 2: 参数变种发现 — 传入 resultDir + targetDir
    this.updateStage('2-paramVariant');
    const stage2 = new ParamVariantStage(
      this.store, this.agent, this.llm,
      resultDir, this.appConfig.targetDir,
    );
    ctx.stage2 = await stage2.run(rawParams);

    // Stage 3: 全局搜索 + AST 定位 + Git 信息
    this.updateStage('3-paramLocate');
    const stage3 = new ParamLocateStage(this.store, businessKey, this.appConfig.targetDir);
    ctx.stage3 = stage3.run(ctx.stage2.pairs);

    if (ctx.stage3.allLocations.length === 0) {
      console.log('[Pipeline] 未找到任何参数位置，提前结束');
      this.finalizeMetadata('completed');
      return ctx;
    }

    // Stage 4: BFS 依赖图构建
    this.updateStage('4-findCall');
    const stage4 = new DependencyGraphStage(
      this.store,
      this.llm,
      concurrency.graphQueue,
      this.appConfig.retry.maxRetries,
    );
    ctx.stage4 = await stage4.run(ctx.stage3.allLocations);

    // Stage 5: 调用树语义分析
    this.updateStage('5-treeAnalyze');
    const stage5 = new TreeAnalyzeStage(
      this.store,
      this.agent,
      concurrency.agentCalls,
    );
    ctx.stage5 = await stage5.run(ctx.stage4.recordsByParam, rawParams);

    // 最终更新 metadata
    this.finalizeMetadata('completed');

    const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`========== Pipeline 完成, 总耗时: ${totalSec}s ==========`);
    return ctx;
  }

  /**
   * 启动时立即写入 metadata，确保中途中断也有基础信息可用
   */
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

  /**
   * 每个 Stage 开始时更新当前阶段
   */
  private updateStage(stage: string): void {
    this.metadata.currentStage = stage;
    this.saveMetadata();
  }

  /**
   * Pipeline 结束时更新最终状态和时间
   */
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
