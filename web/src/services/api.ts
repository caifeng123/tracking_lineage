import type {
  RootItem,
  TreeDetailResponse,
  FileContent,
  DirNode,
  MetadataResponse,
  RepoSummary,
  ParamSummary,
} from '../types';

const BASE = '/api';

async function request<T>(url: string): Promise<T> {
  const res = await fetch(BASE + url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || 'HTTP ' + res.status);
  }
  return res.json() as Promise<T>;
}

// ==================== 全局接口 ====================

/** 获取所有仓库概览 */
export function fetchOverview(): Promise<{ repos: RepoSummary[] }> {
  return request('/overview');
}

// ==================== 仓库维度接口 ====================

/** 获取仓库元数据 */
export function fetchRepoMetadata(repoName: string): Promise<MetadataResponse> {
  return request('/repos/' + encodeURIComponent(repoName) + '/metadata');
}

/** 获取仓库已分析的参数列表 */
export function fetchRepoParams(repoName: string): Promise<{ params: ParamSummary[] }> {
  return request('/repos/' + encodeURIComponent(repoName) + '/params');
}

/** 获取仓库所有调用树根 */
export function fetchRoots(repoName: string): Promise<{ roots: RootItem[] }> {
  return request('/repos/' + encodeURIComponent(repoName) + '/trees');
}

/** 获取单棵树详情 */
export function fetchTreeDetail(repoName: string, rawParam: string, rootId: string): Promise<TreeDetailResponse> {
  return request(
    '/repos/' + encodeURIComponent(repoName) +
    '/trees/' + encodeURIComponent(rawParam) +
    '?rootId=' + encodeURIComponent(rootId)
  );
}

/** 读取文件内容 */
export function fetchFileContent(repoName: string, filePath: string): Promise<FileContent> {
  return request('/repos/' + encodeURIComponent(repoName) + '/files/content?path=' + encodeURIComponent(filePath));
}

/** 获取文件目录树 */
export function fetchFileTree(repoName: string, involvedFiles: string[]): Promise<{ tree: DirNode }> {
  return request(
    '/repos/' + encodeURIComponent(repoName) +
    '/files/tree?involved=' + involvedFiles.map(encodeURIComponent).join(',')
  );
}

/** 懒加载目录子项 */
export function fetchDirChildren(repoName: string, dir: string): Promise<{ children: DirNode[] }> {
  return request('/repos/' + encodeURIComponent(repoName) + '/files/list?dir=' + encodeURIComponent(dir));
}

// ==================== 兼容旧接口（不再使用，保留以防万一） ====================

/** @deprecated use fetchRepoMetadata */
export function fetchMetadata(): Promise<MetadataResponse> {
  return request('/metadata');
}
