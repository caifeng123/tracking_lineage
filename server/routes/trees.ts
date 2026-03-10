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

export function createTreeRoutes(
  resultReader: ResultReader,
  repoReader: RepoReader,
): Hono {
  const app = new Hono();

  /**
   * GET /api/trees — 根列表
   */
  app.get('/', (c) => {
    const rawParams = resultReader.listRawParams();
    const roots: RootItem[] = [];

    for (const rawParam of rawParams) {
      const records = resultReader.readDependencyRecords(rawParam);
      // 路径转换
      const converted = records.map((r) => ({
        ...r,
        absolutePath: repoReader.resolvePath(r.absolutePath),
        calls: r.calls.map((call) => ({
          ...call,
          absolutePath: repoReader.resolvePath(call.absolutePath),
        })),
      }));

      const trees = buildStructuralTrees(converted, repoReader['targetDir']);

      for (const tree of trees) {
        const stats = getTreeStats(tree);
        roots.push({
          rawParam,
          rootId: tree.id,
          rootPath: tree.id,
          rootFunctionName: tree.functionName,
          depth: stats.depth,
          nodeCount: stats.nodeCount,
          fileCount: stats.fileCount,
        });
      }
    }

    return c.json({ roots });
  });

  /**
   * GET /api/trees/:rawParam/:rootId — 单棵树详情
   */
  app.get('/:rawParam', (c) => {
    const rawParam = c.req.param('rawParam');
    const rootId = c.req.query('rootId') ?? '';

    // 构建结构化树
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
    const root = trees.find((t) => t.id === rootId);
    if (!root) {
      return c.json({ error: 'Tree not found' }, 404);
    }

    // 匹配 Stage5 报告
    const analyzedTrees = resultReader.readAnalyzedTrees(rawParam);
    const matched = analyzedTrees.find(
      (t) => t.rootFunctionName === root.functionName,
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
