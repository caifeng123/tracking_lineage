import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { resolve, join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { findProjectRoot } from '@tracking-lineage/core';

// ==================== Types ====================

interface AnalyzeRequest {
  rawParams: string[];
  targetDir?: string;
}

interface StageProgress {
  stage: string;
  stageIndex: number;
  totalStages: number;
  status: 'running' | 'completed' | 'error' | 'skipped';
  message: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

interface AnalyzeJob {
  id: string;
  rawParams: string[];
  targetDir: string;
  resultDir: string;
  status: 'queued' | 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
  currentStage?: string;
  progress: StageProgress[];
  error?: string;
  result?: {
    variantPairs: number;
    functionLocations: number;
    callTrees: number;
  };
}

// ==================== Job Store ====================

const jobStore = new Map<string, AnalyzeJob>();
const jobListeners = new Map<string, Set<(event: string, data: unknown) => void>>();

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function notifyListeners(jobId: string, event: string, data: unknown): void {
  const listeners = jobListeners.get(jobId);
  if (listeners) {
    for (const listener of listeners) {
      listener(event, data);
    }
  }
}

function addListener(jobId: string, listener: (event: string, data: unknown) => void): void {
  if (!jobListeners.has(jobId)) {
    jobListeners.set(jobId, new Set());
  }
  jobListeners.get(jobId)!.add(listener);
}

function removeListener(jobId: string, listener: (event: string, data: unknown) => void): void {
  jobListeners.get(jobId)?.delete(listener);
  if (jobListeners.get(jobId)?.size === 0) {
    jobListeners.delete(jobId);
  }
}

// ==================== Pipeline Stage Definitions ====================

const STAGES = [
  { id: '1-projectAnalyze', name: '项目概览分析', index: 1 },
  { id: '2-paramVariant',   name: '参数变种发现', index: 2 },
  { id: '3-paramLocate',    name: '全局函数定位', index: 3 },
  { id: '4-findCall',       name: '依赖图构建',   index: 4 },
  { id: '5-treeAnalyze',    name: '调用树语义分析', index: 5 },
] as const;

const STAGE_ID_TO_INDEX: Record<string, number> = {};
for (const s of STAGES) { STAGE_ID_TO_INDEX[s.id] = s.index; }

// ==================== Helpers ====================

function resolveResultDir(targetDir: string): string {
  if (process.env.RESULT_DIR) return resolve(process.env.RESULT_DIR);
  const toolRoot = findProjectRoot(import.meta.url);
  const repoName = resolve(targetDir).split('/').pop() ?? 'unknown';
  return resolve(toolRoot, '.results', repoName);
}

function validateGitRepo(dir: string): string | null {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) return `目录不存在: ${absDir}`;
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: absDir, stdio: 'pipe' });
    return null;
  } catch {
    return `"${absDir}" 不是 git 仓库`;
  }
}

/** 检查 5-treeAnalyze 下已分析完成的参数 */
function getAnalyzedParams(resultDir: string): Set<string> {
  const dir = join(resultDir, '5-treeAnalyze');
  if (!existsSync(dir)) return new Set();
  try {
    return new Set(
      readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
    );
  } catch {
    return new Set();
  }
}

function emitStage(job: AnalyzeJob, progress: StageProgress): void {
  job.progress.push(progress);
  notifyListeners(job.id, 'stage', progress);
}

// ==================== Pipeline Runner ====================

async function runPipeline(job: AnalyzeJob): Promise<void> {
  job.status = 'running';
  job.startTime = Date.now();
  notifyListeners(job.id, 'status', { status: 'running' });

  try {
    const { ConfigManager } = await import('@tracking-lineage/core');
    const { FileResultStore } = await import('@tracking-lineage/core');
    const { Pipeline } = await import('@tracking-lineage/core');

    const appConfig = ConfigManager.getAppConfig(job.rawParams, job.targetDir);
    appConfig.resultDir = job.resultDir;
    const store = new FileResultStore(appConfig.resultDir);
    const pipeline = new Pipeline(appConfig, store);

    const metadataPath = join(job.resultDir, 'metadata.json');

    const reportedStages = new Set<number>();
    let lastStageId = '';
    let stageStartTime = Date.now();

    const pollInterval = setInterval(() => {
      try {
        if (!existsSync(metadataPath)) return;
        const raw = readFileSync(metadataPath, 'utf-8');
        const meta = JSON.parse(raw);

        if (!meta.currentStage || meta.currentStage === 'init') return;
        if (meta.currentStage === lastStageId) return;

        const currentIndex = STAGE_ID_TO_INDEX[meta.currentStage];
        if (!currentIndex) return;

        for (const s of STAGES) {
          if (s.index >= currentIndex) break;
          if (reportedStages.has(s.index)) continue;
          emitStage(job, {
            stage: s.name,
            stageIndex: s.index,
            totalStages: STAGES.length,
            status: 'skipped',
            message: `${s.name} 已完成（快速跳过）`,
            durationMs: 0,
          });
          reportedStages.add(s.index);
        }

        if (lastStageId) {
          const prevIndex = STAGE_ID_TO_INDEX[lastStageId];
          const prevDef = STAGES.find(s => s.index === prevIndex);
          if (prevDef) {
            emitStage(job, {
              stage: prevDef.name,
              stageIndex: prevDef.index,
              totalStages: STAGES.length,
              status: 'completed',
              message: `${prevDef.name} 完成`,
              durationMs: Date.now() - stageStartTime,
            });
            reportedStages.add(prevDef.index);
          }
        }

        lastStageId = meta.currentStage;
        stageStartTime = Date.now();
        job.currentStage = meta.currentStage;

        const stageDef = STAGES.find(s => s.id === meta.currentStage);
        if (stageDef) {
          emitStage(job, {
            stage: stageDef.name,
            stageIndex: stageDef.index,
            totalStages: STAGES.length,
            status: 'running',
            message: `正在执行 ${stageDef.name}...`,
          });
        }
      } catch { /* ignore */ }
    }, 500);

    const ctx = await pipeline.run();
    clearInterval(pollInterval);

    for (const s of STAGES) {
      if (!reportedStages.has(s.index)) {
        emitStage(job, {
          stage: s.name,
          stageIndex: s.index,
          totalStages: STAGES.length,
          status: 'skipped',
          message: `${s.name} 已完成（快速跳过）`,
          durationMs: 0,
        });
        reportedStages.add(s.index);
      }
    }

    if (lastStageId) {
      const prevDef = STAGES.find(s => s.id === lastStageId);
      if (prevDef) {
        emitStage(job, {
          stage: prevDef.name,
          stageIndex: prevDef.index,
          totalStages: STAGES.length,
          status: 'completed',
          message: `${prevDef.name} 完成`,
          durationMs: Date.now() - stageStartTime,
        });
      }
    }

    const stage3Count = ctx.stage3?.allLocations.length ?? 0;
    const stage5Count = ctx.stage5
      ? [...ctx.stage5.treesByParam.values()].reduce((sum, trees) => sum + trees.length, 0)
      : 0;

    job.result = {
      variantPairs: ctx.stage2?.pairs.length ?? 0,
      functionLocations: stage3Count,
      callTrees: stage5Count,
    };
    job.status = 'completed';
    job.endTime = Date.now();
    job.currentStage = undefined;

    notifyListeners(job.id, 'complete', {
      result: job.result,
      durationMs: job.endTime - job.startTime,
    });

  } catch (error) {
    job.status = 'error';
    job.endTime = Date.now();
    job.error = error instanceof Error ? error.message : String(error);

    notifyListeners(job.id, 'error', {
      error: job.error,
      durationMs: job.endTime - job.startTime,
    });
  }
}

// ==================== Routes ====================

export function createAnalyzeRoutes(defaultTargetDir?: string): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    let body: AnalyzeRequest;
    try {
      body = await c.req.json<AnalyzeRequest>();
    } catch {
      return c.json({ error: '请求体格式错误' }, 400);
    }

    if (!body.rawParams || !Array.isArray(body.rawParams) || body.rawParams.length === 0) {
      return c.json({ error: '请提供至少一个参数名 (rawParams)' }, 400);
    }

    const rawParams = body.rawParams.map(p => String(p).trim()).filter(Boolean);
    if (rawParams.length === 0) {
      return c.json({ error: '参数名不能为空' }, 400);
    }

    const targetDir = resolve(body.targetDir || defaultTargetDir || process.cwd());
    const validationError = validateGitRepo(targetDir);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    const resultDir = resolveResultDir(targetDir);

    // 过滤已分析完成的参数（相同字段直接跳过）
    const existingParams = getAnalyzedParams(resultDir);
    const newParams = rawParams.filter(p => !existingParams.has(p));
    const skippedParams = rawParams.filter(p => existingParams.has(p));

    if (newParams.length === 0) {
      return c.json({
        jobId: null,
        rawParams,
        skippedParams,
        newParams: [],
        targetDir,
        resultDir,
        message: `所有参数已分析过，跳过: ${skippedParams.join(', ')}`,
        alreadyDone: true,
      }, 200);
    }

    const jobId = generateJobId();

    const job: AnalyzeJob = {
      id: jobId,
      rawParams: newParams,
      targetDir,
      resultDir,
      status: 'queued',
      startTime: Date.now(),
      progress: [],
    };

    jobStore.set(jobId, job);
    runPipeline(job).catch(() => {});

    return c.json({
      jobId,
      rawParams: newParams,
      skippedParams,
      targetDir,
      resultDir,
      startTime: job.startTime,
      message: skippedParams.length > 0
        ? `分析任务已创建，追踪: ${newParams.join(', ')}（跳过已分析: ${skippedParams.join(', ')}）`
        : `分析任务已创建，追踪参数: ${newParams.join(', ')}`,
    }, 201);
  });

  app.get('/:jobId', (c) => {
    const jobId = c.req.param('jobId');
    const job = jobStore.get(jobId);
    if (!job) return c.json({ error: '任务不存在' }, 404);

    return c.json({
      id: job.id,
      rawParams: job.rawParams,
      targetDir: job.targetDir,
      resultDir: job.resultDir,
      status: job.status,
      currentStage: job.currentStage,
      progress: job.progress,
      result: job.result,
      error: job.error,
      startTime: job.startTime,
      endTime: job.endTime,
      durationMs: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime,
    });
  });

  app.get('/:jobId/stream', (c) => {
    const jobId = c.req.param('jobId');
    const job = jobStore.get(jobId);
    if (!job) return c.json({ error: '任务不存在' }, 404);

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'init',
        data: JSON.stringify({
          id: job.id,
          rawParams: job.rawParams,
          status: job.status,
          currentStage: job.currentStage,
          progress: job.progress,
          startTime: job.startTime,
        }),
      });

      if (job.status === 'completed') {
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ result: job.result, durationMs: (job.endTime ?? Date.now()) - job.startTime }),
        });
        return;
      }
      if (job.status === 'error') {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: job.error }),
        });
        return;
      }

      const listener = async (event: string, data: unknown) => {
        try {
          await stream.writeSSE({ event, data: JSON.stringify(data) });
        } catch {}
      };

      addListener(jobId, listener);

      try {
        while (job.status === 'queued' || job.status === 'running') {
          await stream.writeSSE({ event: 'heartbeat', data: '{}' });
          await stream.sleep(3000);
        }
      } catch {}

      removeListener(jobId, listener);
    });
  });

  app.get('/', (c) => {
    const resolvedTarget = defaultTargetDir ? resolve(defaultTargetDir) : null;
    const jobs = [...jobStore.values()]
      .filter(job => !resolvedTarget || resolve(job.targetDir) === resolvedTarget)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 50)
      .map(job => ({
        id: job.id,
        rawParams: job.rawParams,
        status: job.status,
        currentStage: job.currentStage,
        startTime: job.startTime,
        endTime: job.endTime,
        durationMs: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime,
        result: job.result,
        error: job.error,
      }));

    return c.json({ jobs });
  });

  return app;
}