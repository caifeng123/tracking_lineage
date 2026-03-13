import { execSync } from 'child_process';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { findProjectRoot } from '../src/utils/findRoot.js';
import { ResultReader } from './services/resultReader.js';
import { RepoReader } from './services/repoReader.js';
import { createTreeRoutes } from './routes/trees.js';
import { createFileRoutes } from './routes/files.js';
import { createAnalyzeRoutes } from './routes/analyze.js';
import { createRepoRoutes } from './routes/repos.js';

// ==================== Path Helpers ====================

const PROJECT_ROOT = findProjectRoot(import.meta.url);

export function getReposDir(): string {
  return resolve(PROJECT_ROOT, 'repos');
}

export function getResultsDir(): string {
  return resolve(PROJECT_ROOT, '.results');
}

export function getRepoPath(repoName: string): string {
  return resolve(getReposDir(), repoName);
}

export function getResultDir(repoName: string): string {
  return resolve(getResultsDir(), repoName);
}

// ==================== Dynamic Reader Factory ====================

// 缓存 Reader 实例，避免重复创建
const readerCache = new Map<string, { resultReader: ResultReader; repoReader: RepoReader; createdAt: number }>();
const CACHE_TTL = 60_000; // 1 分钟缓存

export function getReaders(repoName: string): { resultReader: ResultReader; repoReader: RepoReader } | null {
  const repoPath = getRepoPath(repoName);
  const resultDir = getResultDir(repoName);

  if (!existsSync(repoPath)) return null;

  // 检查缓存
  const cached = readerCache.get(repoName);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL) {
    return { resultReader: cached.resultReader, repoReader: cached.repoReader };
  }

  const resultReader = new ResultReader(resultDir);
  const metadata = resultReader.readMetadata();
  const analysisDir = metadata?.analysisDir ?? repoPath;
  const repoReader = new RepoReader(repoPath, analysisDir);

  readerCache.set(repoName, { resultReader, repoReader, createdAt: Date.now() });

  return { resultReader, repoReader };
}

// ==================== Repo Info ====================

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

export function listRepoSummaries(): RepoSummary[] {
  const reposDir = getReposDir();
  const resultsDir = getResultsDir();
  const summaries: RepoSummary[] = [];

  if (!existsSync(reposDir)) return summaries;

  const entries = readdirSync(reposDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const repoPath = join(reposDir, entry.name);
    const resultDir = join(resultsDir, entry.name);
    const stat = statSync(repoPath);

    const resultReader = new ResultReader(resultDir);
    const metadata = resultReader.readMetadata();

    let gitUrl: string | undefined;
    try {
      
      gitUrl = execSync('git remote get-url origin', { cwd: repoPath, stdio: 'pipe' }).toString().trim();
    } catch {}

    summaries.push({
      name: entry.name,
      path: repoPath,
      resultDir,
      hasResults: metadata !== null,
      gitUrl,
      metadata: metadata ? {
        commitId: metadata.commitId,
        analyzedAt: metadata.analyzedAt,
        rawParams: metadata.rawParams,
      } : undefined,
      lastModified: stat.mtimeMs,
    });
  }

  summaries.sort((a, b) => b.lastModified - a.lastModified);
  return summaries;
}

// ==================== App Factory ====================

export function createApp() {
  const app = new Hono();

  const publicDir = resolve(PROJECT_ROOT, 'server', 'public');

  // 中间件
  app.use('/api/*', cors());

  // ---- 全局路由 ----

  // 仓库管理（克隆/删除/列表）
  app.route('/api/repos', createRepoRoutes());

  // 仓库概览列表（带分析结果统计）
  app.get('/api/overview', (c) => {
    return c.json({ repos: listRepoSummaries() });
  });

  // ---- 仓库维度路由 ----

  // /api/repos/:repoName/metadata
  app.get('/api/repos/:repoName/metadata', (c) => {
    const repoName = c.req.param('repoName');
    const readers = getReaders(repoName);
    if (!readers) return c.json({ error: `仓库不存在: ${repoName}` }, 404);

    const metadata = readers.resultReader.readMetadata();
    return c.json({
      metadata,
      targetDir: getRepoPath(repoName),
      resultDir: getResultDir(repoName),
    });
  });

  // /api/repos/:repoName/params — 列出已分析的参数及其统计
  app.get('/api/repos/:repoName/params', (c) => {
    const repoName = c.req.param('repoName');
    const readers = getReaders(repoName);
    if (!readers) return c.json({ error: `仓库不存在: ${repoName}` }, 404);

    const rawParams = readers.resultReader.listAnalyzedParams();
    const params = rawParams.map(param => {
      const trees = readers.resultReader.readAnalyzedTrees(param);
      return {
        rawParam: param,
        treeCount: trees.length,
      };
    });

    return c.json({ params });
  });

  // /api/repos/:repoName/trees — 该仓库所有调用树根列表
  app.get('/api/repos/:repoName/trees', (c) => {
    const repoName = c.req.param('repoName');
    const readers = getReaders(repoName);
    if (!readers) return c.json({ error: `仓库不存在: ${repoName}` }, 404);

    const treeRoutes = createTreeRoutes(readers.resultReader, readers.repoReader);
    // 直接委托给 tree routes 的根列表接口
    return treeRoutes.fetch(new Request('http://localhost/', { method: 'GET' }), c.env);
  });

  // /api/repos/:repoName/trees/:rawParam — 单棵树详情
  app.get('/api/repos/:repoName/trees/:rawParam', (c) => {
    const repoName = c.req.param('repoName');
    const rawParam = c.req.param('rawParam');
    const rootId = c.req.query('rootId') ?? '';
    const readers = getReaders(repoName);
    if (!readers) return c.json({ error: `仓库不存在: ${repoName}` }, 404);

    const treeRoutes = createTreeRoutes(readers.resultReader, readers.repoReader);
    const url = `http://localhost/${encodeURIComponent(rawParam)}?rootId=${encodeURIComponent(rootId)}`;
    return treeRoutes.fetch(new Request(url, { method: 'GET' }), c.env);
  });

  // /api/repos/:repoName/files/* — 文件接口
  app.all('/api/repos/:repoName/files/*', (c) => {
    const repoName = c.req.param('repoName');
    const readers = getReaders(repoName);
    if (!readers) return c.json({ error: `仓库不存在: ${repoName}` }, 404);

    const fileRoutes = createFileRoutes(readers.repoReader);
    // 提取 /api/repos/:repoName/files 之后的路径
    const originalUrl = new URL(c.req.url);
    const subPath = originalUrl.pathname.replace(`/api/repos/${repoName}/files`, '') || '/';
    const newUrl = new URL(`http://localhost${subPath}`);
    originalUrl.searchParams.forEach((v, k) => newUrl.searchParams.set(k, v));
    return fileRoutes.fetch(new Request(newUrl.toString(), { method: c.req.method }), c.env);
  });

  // /api/repos/:repoName/analyze — 分析任务（绑定仓库路径）
  // 使用独立的辅助函数进行委托，避免 app.route + all('/*') 无法匹配根路径的问题
  const analyzeDelegate = async (c: any, subPath: string) => {
    const repoName = c.req.param('repoName');
    const repoPath = getRepoPath(repoName);

    if (!existsSync(repoPath)) {
      return c.json({ error: `仓库不存在: ${repoName}` }, 404);
    }

    const analyzeRoutes = createAnalyzeRoutes(repoPath);
    const url = new URL(c.req.url);
    const newUrl = new URL(`http://localhost${subPath}`);
    url.searchParams.forEach((v: string, k: string) => newUrl.searchParams.set(k, v));
    return analyzeRoutes.fetch(
      new Request(newUrl.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
      }),
      c.env,
    );
  };

  // POST /api/repos/:repoName/analyze — 创建分析任务
  app.post('/api/repos/:repoName/analyze', (c) => analyzeDelegate(c, '/'));

  // GET /api/repos/:repoName/analyze — 任务列表
  app.get('/api/repos/:repoName/analyze', (c) => analyzeDelegate(c, '/'));

  // GET /api/repos/:repoName/analyze/:jobId — 任务详情
  app.get('/api/repos/:repoName/analyze/:jobId', (c) => {
    const jobId = c.req.param('jobId');
    return analyzeDelegate(c, '/' + encodeURIComponent(jobId));
  });

  // GET /api/repos/:repoName/analyze/:jobId/stream — SSE 事件流
  app.get('/api/repos/:repoName/analyze/:jobId/stream', (c) => {
    const jobId = c.req.param('jobId');
    return analyzeDelegate(c, '/' + encodeURIComponent(jobId) + '/stream');
  });

  // 静态文件 — 前端产物
  app.use('/*', serveStatic({ root: publicDir }));
  app.get('*', serveStatic({ root: publicDir, path: 'index.html' }));

  return app;
}
