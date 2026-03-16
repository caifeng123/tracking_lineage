import { relative } from 'path';

/**
 * Stage4 jsonl 中每行的结构 (DependencyRecord)
 */
export interface DepRecord {
  param: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  functionName: string;
  calls: Array<{
    functionName: string;
    absolutePath: string;
    startLine: number;
    endLine: number;
    params: Array<{ name: string; index: number; reason: string }>;
  }>;
}

/**
 * 前端可用的结构化调用树节点
 */
export interface TreeNode {
  id: string;
  functionName: string;
  filePath: string;       // 相对路径
  absolutePath: string;   // 转换后的绝对路径
  startLine: number;
  endLine: number;
  param: string;
  isCycle: boolean;
  children: TreeNode[];
}

export interface TreeStats {
  depth: number;
  nodeCount: number;
  fileCount: number;
}

/**
 * 从 DependencyRecord[] 构建结构化调用树
 */
export function buildStructuralTrees(
  records: DepRecord[],
  targetDir: string,
): TreeNode[] {
  if (records.length === 0) return [];

  const funcMap = new Map<string, DepRecord>();
  const calledSet = new Set<string>();

  for (const rec of records) {
    funcMap.set(funcId(rec), rec);
    for (const call of rec.calls) {
      calledSet.add(funcId(call));
    }
  }

  // 根节点 = 没有被别人调用的节点
  const roots: DepRecord[] = [];
  for (const [id, rec] of funcMap) {
    if (!calledSet.has(id)) roots.push(rec);
  }

  return roots.map((root) => buildNode(root, funcMap, new Set(), targetDir));
}

function funcId(rec: { absolutePath: string; startLine: number }): string {
  return `${rec.absolutePath}:${rec.startLine}`;
}

function buildNode(
  rec: DepRecord,
  funcMap: Map<string, DepRecord>,
  visited: Set<string>,
  targetDir: string,
): TreeNode {
  const id = funcId(rec);
  const relPath = relative(targetDir, rec.absolutePath) || rec.absolutePath;

  if (visited.has(id)) {
    return {
      id,
      functionName: rec.functionName,
      filePath: relPath,
      absolutePath: rec.absolutePath,
      startLine: rec.startLine,
      endLine: rec.endLine,
      param: rec.param,
      isCycle: true,
      children: [],
    };
  }

  visited.add(id);

  const children: TreeNode[] = [];
  for (const call of rec.calls) {
    const childRec = funcMap.get(funcId(call));
    if (childRec) {
      children.push(buildNode(childRec, funcMap, visited, targetDir));
    }
  }

  visited.delete(id);

  return {
    id,
    functionName: rec.functionName,
    filePath: relPath,
    absolutePath: rec.absolutePath,
    startLine: rec.startLine,
    endLine: rec.endLine,
    param: rec.param,
    isCycle: false,
    children,
  };
}

/**
 * 计算树的统计信息
 */
export function getTreeStats(root: TreeNode): TreeStats {
  const files = new Set<string>();
  let maxDepth = 0;
  let nodeCount = 0;

  function walk(node: TreeNode, depth: number): void {
    nodeCount++;
    files.add(node.filePath);
    if (depth > maxDepth) maxDepth = depth;
    if (!node.isCycle) {
      for (const child of node.children) walk(child, depth + 1);
    }
  }

  walk(root, 1);
  return { depth: maxDepth, nodeCount, fileCount: files.size };
}

/**
 * 收集树中涉及的所有文件路径（去重）
 */
export function collectInvolvedFiles(root: TreeNode): string[] {
  const files = new Set<string>();
  function walk(node: TreeNode): void {
    files.add(node.filePath);
    if (!node.isCycle) {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  return [...files].sort();
}
