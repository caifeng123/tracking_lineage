// ==================== Repo API Types ====================

export interface RepoInfo {
  name: string;
  path: string;
  gitUrl?: string;
  lastModified: number;
}

export interface RepoListResponse {
  repos: RepoInfo[];
  reposDir: string;
}

export interface CloneResponse {
  cloneId: string;
  repoName: string;
  repoPath: string;
  message: string;
  existed: boolean;
}

export interface CloneSSECallbacks {
  onInit?: (data: { status: string; repoName: string; repoPath: string }) => void;
  onProgress?: (data: { message: string }) => void;
  onComplete?: (data: { repoName: string; repoPath: string; message: string }) => void;
  onError?: (data: { error: string }) => void;
  onDisconnect?: () => void;
}

// ==================== API Functions ====================

const BASE = '/api';

/** 获取已克隆的仓库列表 */
export async function fetchRepos(): Promise<RepoListResponse> {
  const res = await fetch(BASE + '/repos');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || 'HTTP ' + res.status);
  }
  return res.json() as Promise<RepoListResponse>;
}

/** 克隆/更新一个 git 仓库 */
export async function cloneRepo(gitUrl: string, dirName?: string): Promise<CloneResponse> {
  const res = await fetch(BASE + '/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gitUrl, dirName: dirName || undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || 'HTTP ' + res.status);
  }
  return res.json() as Promise<CloneResponse>;
}

/** 删除一个已克隆的仓库 */
export async function deleteRepo(repoName: string): Promise<void> {
  const res = await fetch(BASE + '/repos/' + encodeURIComponent(repoName), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || 'HTTP ' + res.status);
  }
}

/** 订阅克隆进度 SSE */
export function subscribeCloneSSE(cloneId: string, callbacks: CloneSSECallbacks): () => void {
  const url = BASE + '/repos/' + encodeURIComponent(cloneId) + '/stream';
  const source = new EventSource(url);

  source.addEventListener('init', (e) => {
    try {
      callbacks.onInit?.(JSON.parse(e.data));
    } catch {}
  });

  source.addEventListener('progress', (e) => {
    try {
      callbacks.onProgress?.(JSON.parse(e.data));
    } catch {}
  });

  source.addEventListener('complete', (e) => {
    try {
      callbacks.onComplete?.(JSON.parse(e.data));
    } catch {}
    source.close();
  });

  source.addEventListener('error', (e) => {
    if (e instanceof MessageEvent && e.data) {
      try {
        callbacks.onError?.(JSON.parse(e.data));
      } catch {}
    }
    source.close();
  });

  source.onerror = () => {
    callbacks.onDisconnect?.();
    source.close();
  };

  return () => source.close();
}
