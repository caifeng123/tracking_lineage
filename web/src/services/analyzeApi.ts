import type {
  AnalyzeRequest,
  AnalyzeCreateResponse,
  AnalyzeJobStatus,
  AnalyzeJobListResponse,
  StageProgress,
  SSEInitData,
  SSECompleteData,
  SSEErrorData,
} from '../types/analyze';

const BASE = '/api';

/**
 * 创建新分析任务
 */
export async function createAnalyzeJob(req: AnalyzeRequest): Promise<AnalyzeCreateResponse> {
  const res = await fetch(BASE + '/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || 'HTTP ' + res.status);
  }
  return res.json() as Promise<AnalyzeCreateResponse>;
}

/**
 * 获取分析任务状态（轮询方式）
 */
export async function fetchAnalyzeJob(jobId: string): Promise<AnalyzeJobStatus> {
  const res = await fetch(BASE + '/analyze/' + encodeURIComponent(jobId));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || 'HTTP ' + res.status);
  }
  return res.json() as Promise<AnalyzeJobStatus>;
}

/**
 * 获取所有分析任务列表
 */
export async function fetchAnalyzeJobs(): Promise<AnalyzeJobListResponse> {
  const res = await fetch(BASE + '/analyze');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || 'HTTP ' + res.status);
  }
  return res.json() as Promise<AnalyzeJobListResponse>;
}

/**
 * SSE 事件监听回调
 */
export interface AnalyzeSSECallbacks {
  onInit?: (data: SSEInitData) => void;
  onStage?: (data: StageProgress) => void;
  onStatus?: (data: { status: string }) => void;
  onComplete?: (data: SSECompleteData) => void;
  onError?: (data: SSEErrorData) => void;
  onHeartbeat?: () => void;
  onDisconnect?: () => void;
}

/**
 * 订阅分析任务的 SSE 实时事件流
 * @returns 取消订阅函数
 */
export function subscribeAnalyzeSSE(jobId: string, callbacks: AnalyzeSSECallbacks): () => void {
  const url = BASE + '/analyze/' + encodeURIComponent(jobId) + '/stream';
  const source = new EventSource(url);

  source.addEventListener('init', (e) => {
    try {
      const data = JSON.parse(e.data) as SSEInitData;
      callbacks.onInit?.(data);
    } catch { /* ignore */ }
  });

  source.addEventListener('stage', (e) => {
    try {
      const data = JSON.parse(e.data) as StageProgress;
      callbacks.onStage?.(data);
    } catch { /* ignore */ }
  });

  source.addEventListener('status', (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onStatus?.(data);
    } catch { /* ignore */ }
  });

  source.addEventListener('complete', (e) => {
    try {
      const data = JSON.parse(e.data) as SSECompleteData;
      callbacks.onComplete?.(data);
    } catch { /* ignore */ }
    source.close();
  });

  source.addEventListener('error', (e) => {
    if (e instanceof MessageEvent && e.data) {
      try {
        const data = JSON.parse(e.data) as SSEErrorData;
        callbacks.onError?.(data);
      } catch { /* ignore */ }
    }
    source.close();
  });

  source.addEventListener('heartbeat', () => {
    callbacks.onHeartbeat?.();
  });

  source.onerror = () => {
    callbacks.onDisconnect?.();
    source.close();
  };

  // Return cleanup function
  return () => {
    source.close();
  };
}
