import { Hono } from 'hono';
import type { ResultReader } from '../services/resultReader.js';
import type { RepoReader } from '../services/repoReader.js';
import {
  buildStructuralTrees,
  getTreeStats,
  collectInvolvedFiles,
  type TreeNode,
} from '../utils/structuralTree.js';

export interface RootItem {
  rawParam: string;
  rootId: string;
  rootPath: string;
  rootFunctionName: string;
  depth: number;
  nodeCount: number;
  fileCount: number;
}

/**
 * 从 treeStrRead 简单估算树的统计信息（不需要完整结构化树）
 */
function estimateTreeStats(treeStr: string): { depth: number; nodeCount: number; fileCount: number } {
  const lines = treeStr.split('\n').filter((l) => l.trim());
  const files = new Set<string>();
  let maxDepth = 0;

  for (const line of lines) {
    // 估算深度：每 4 个空格或一个 │ 前缀代表一层
    const stripped = line.replace(/[│├└─\s]/g, '');
    const leadingLen = line.length - line.replace(/^[\s│├└─]+/, '').length;
    const depth = Math.floor(leadingLen / 4) + 1;
    if (depth > maxDepth) maxDepth = depth;

    // 提取文件名 (格式: functionName (filepath:line) 或 filepath:line)
    const match = line.match(/\(([^)]+:\d+)\)/);
    if (match) {
      const filePart = match[1].replace(/:\d+$/, '');
      files.add(filePart);
    }
  }

  return { depth: maxDepth, nodeCount: lines.length, fileCount: files.size };
}

export function createTreeRoutes(
  resultReader: ResultReader,
  repoReader: RepoReader,
): Hono {
  const app = new Hono();

  /**
   * GET /api/trees — 根列表
   * 数据源：5-treeAnalyze（每行 jsonl = 一棵真正的调用树）
   */
  app.get('/', (c) => {
    const rawParams = resultReader.listAnalyzedParams();
    const roots: RootItem[] = [];

    for (const rawParam of rawParams) {
      const analyzedTrees = resultReader.readAnalyzedTrees(rawParam);

      for (const tree of analyzedTrees) {
        const stats = estimateTreeStats(tree.treeStrRead);
        roots.push({
          rawParam,
          rootId: tree.rootPath,
          rootPath: tree.rootPath,
          rootFunctionName: tree.rootFunctionName,
          depth: stats.depth,
          nodeCount: stats.nodeCount,
          fileCount: stats.fileCount,
        });
      }
    }

    return c.json({ roots });
  });

  /**
   * GET /api/trees/:rawParam?rootId=xxx — 单棵树详情
   * 从 4-findCall 构建完整结构化树，用 rootId (rootPath) 关联
   */
  app.get('/:rawParam', (c) => {
    const rawParam = c.req.param('rawParam');
    const rootId = c.req.query('rootId') ?? '';

    // 从 4-findCall 构建结构化树
    const records = resultReader.readDependencyRecords(rawParam);
    const converted = records.map((r) => ({
      ...r,
      absolutePath: repoReader.resolvePath(r.absolutePath),
      calls: r.calls.map((call) => ({
        ...call,
        absolutePath: repoReader.resolvePath(call.absolutePath),
      })),
    }));

    const trees = buildStructuralTrees(converted, repoReader['targetDir']);

    // rootId 格式为 absolutePath:startLine，需要做路径映射匹配
    let root = trees.find((t) => t.id === rootId);

    // 如果直接匹配失败，尝试路径映射后匹配
    if (!root) {
      const mappedRootId = repoReader.resolvePath(rootId.replace(/:\d+$/, ''))
        + ':' + rootId.replace(/^.*:/, '');
      root = trees.find((t) => t.id === mappedRootId);
    }

    // 兜底：按函数名匹配
    if (!root) {
      const analyzedTrees = resultReader.readAnalyzedTrees(rawParam);
      const matched = analyzedTrees.find((t) => t.rootPath === rootId);
      if (matched) {
        root = trees.find((t) => t.functionName === matched.rootFunctionName);
      }
    }

    if (!root) {
      return c.json({ error: 'Tree not found' }, 404);
    }

    // 匹配 Stage5 报告
    const analyzedTrees = resultReader.readAnalyzedTrees(rawParam);
    const matched = analyzedTrees.find(
      (t) => t.rootFunctionName === root!.functionName,
    );

    const involvedFiles = collectInvolvedFiles(root);

    return c.json({
      root,
      summary: matched?.summary ?? '',
      involvedFiles,
    });
  });

  return app;
}
