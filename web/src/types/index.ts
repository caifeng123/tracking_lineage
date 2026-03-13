/** 调用树节点 */
export interface TreeNode {
  id: string;
  functionName: string;
  filePath: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  param: string;
  isCycle: boolean;
  children: TreeNode[];
}

/** 根列表项 */
export interface RootItem {
  rawParam: string;
  rootId: string;
  rootPath: string;
  rootFunctionName: string;
  depth: number;
  nodeCount: number;
  fileCount: number;
}

/** 文件目录树节点 */
export interface DirNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  involved: boolean;
  lazy?: boolean;
  children?: DirNode[];
}

/** 文件内容响应 */
export interface FileContent {
  filePath: string;
  content: string;
  totalLines: number;
  language: string;
}

/** 树详情响应 */
export interface TreeDetailResponse {
  root: TreeNode;
  summary: string;
  involvedFiles: string[];
}

/** 元数据 */
export interface Metadata {
  repoName: string;
  analysisDir: string;
  commitId: string;
  rawParams: string[];
  businessKey: string;
  analyzedAt: string;
  version: string;
}

export interface MetadataResponse {
  metadata: Metadata | null;
  targetDir: string;
  resultDir: string;
}

/** 仓库概览 */
export interface RepoSummary {
  name: string;
  path: string;
  resultDir: string;
  hasResults: boolean;
  gitUrl?: string;
  metadata?: {
    commitId?: string;
    analyzedAt?: string;
    rawParams?: string[];
  };
  lastModified: number;
}

/** 参数统计 */
export interface ParamSummary {
  rawParam: string;
  treeCount: number;
}
