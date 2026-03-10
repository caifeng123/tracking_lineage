import type {
  RootItem,
  TreeDetailResponse,
  FileContent,
  DirNode,
  MetadataResponse,
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

export function fetchRoots(): Promise<{ roots: RootItem[] }> {
  return request('/trees');
}

export function fetchTreeDetail(rawParam: string, rootId: string): Promise<TreeDetailResponse> {
  return request('/trees/' + encodeURIComponent(rawParam) + '?rootId=' + encodeURIComponent(rootId));
}

export function fetchFileContent(filePath: string): Promise<FileContent> {
  return request('/files/content?path=' + encodeURIComponent(filePath));
}

export function fetchFileTree(involvedFiles: string[]): Promise<{ tree: DirNode }> {
  return request('/files/tree?involved=' + involvedFiles.map(encodeURIComponent).join(','));
}

export function fetchDirChildren(dir: string): Promise<{ children: DirNode[] }> {
  return request('/files/list?dir=' + encodeURIComponent(dir));
}

export function fetchMetadata(): Promise<MetadataResponse> {
  return request('/metadata');
}
