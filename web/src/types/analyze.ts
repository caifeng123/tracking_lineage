// ==================== Analyze API Types ====================

/** 分析任务创建请求 */
export interface AnalyzeRequest {
  rawParams: string[];
  targetDir?: string;
}

/** 分析任务创建响应 */
export interface AnalyzeCreateResponse {
  jobId: string;
  rawParams: string[];
  targetDir: string;
  resultDir: string;
  message: string;
}

/** 阶段进度 */
export interface StageProgress {
  stage: string;
  stageIndex: number;
  totalStages: number;
  status: 'running' | 'completed' | 'error' | 'skipped';
  message: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

/** 分析任务结果 */
export interface AnalyzeResult {
  variantPairs: number;
  functionLocations: number;
  callTrees: number;
}

/** 分析任务状态 */
export interface AnalyzeJobStatus {
  id: string;
  rawParams: string[];
  targetDir: string;
  resultDir: string;
  status: 'queued' | 'running' | 'completed' | 'error';
  currentStage?: string;
  progress: StageProgress[];
  result?: AnalyzeResult;
  error?: string;
  startTime: number;
  endTime?: number;
  durationMs: number;
}

/** 分析任务列表响应 */
export interface AnalyzeJobListResponse {
  jobs: Array<{
    id: string;
    rawParams: string[];
    status: 'queued' | 'running' | 'completed' | 'error';
    currentStage?: string;
    startTime: number;
    endTime?: number;
    durationMs: number;
    result?: AnalyzeResult;
    error?: string;
  }>;
}

/** SSE 事件数据 */
export interface SSEInitData {
  id: string;
  rawParams: string[];
  status: string;
  currentStage?: string;
  progress: StageProgress[];
  startTime?: number;
}

export interface SSECompleteData {
  result: AnalyzeResult;
  durationMs: number;
}

export interface SSEErrorData {
  error: string;
  durationMs?: number;
}
