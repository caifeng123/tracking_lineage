import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve } from 'path';
import { findProjectRoot } from '../src/utils/findRoot.js';
import { ResultReader } from './services/resultReader.js';
import { RepoReader } from './services/repoReader.js';
import { createTreeRoutes } from './routes/trees.js';
import { createFileRoutes } from './routes/files.js';

export interface ServerConfig {
  targetDir: string;
  resultDir: string;
}

export function createApp(config: ServerConfig) {
  const app = new Hono();

  // 静态资源绝对路径 — 基于项目根目录，不依赖 cwd
  const projectRoot = findProjectRoot(import.meta.url);
  const publicDir = resolve(projectRoot, 'server', 'public');

  // 读取 metadata 并计算路径映射
  const resultReader = new ResultReader(config.resultDir);
  const metadata = resultReader.readMetadata();
  const analysisDir = metadata?.analysisDir ?? config.targetDir;

  if (analysisDir !== config.targetDir) {
    console.log(`[serve] 路径映射: ${analysisDir} → ${config.targetDir}`);
  }

  if (metadata?.commitId) {
    console.log(`[serve] 分析时 commit: ${metadata.commitId}`);
  }

  const repoReader = new RepoReader(config.targetDir, analysisDir);

  // 中间件
  app.use('/api/*', cors());

  // API 路由
  app.route('/api/trees', createTreeRoutes(resultReader, repoReader));
  app.route('/api/files', createFileRoutes(repoReader));

  // 元信息接口
  app.get('/api/metadata', (c) => {
    return c.json({
      metadata,
      targetDir: config.targetDir,
      resultDir: config.resultDir,
      pathMapped: analysisDir !== config.targetDir,
    });
  });

  // 静态文件 — 前端产物（使用绝对路径）
  app.use('/*', serveStatic({ root: publicDir }));
  // SPA fallback
  app.get('*', serveStatic({ root: publicDir, path: 'index.html' }));

  return app;
}
