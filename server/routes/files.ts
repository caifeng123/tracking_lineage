import { Hono } from 'hono';
import type { RepoReader } from '../services/repoReader.js';

export function createFileRoutes(repoReader: RepoReader): Hono {
  const app = new Hono();

  /**
   * GET /api/files/content?path=src/index.ts
   */
  app.get('/content', (c) => {
    const filePath = c.req.query('path');
    if (!filePath) {
      return c.json({ error: 'Missing path parameter' }, 400);
    }

    const result = repoReader.readFile(filePath);
    if (!result) {
      return c.json({ error: 'File not found or access denied' }, 404);
    }

    return c.json({
      filePath,
      ...result,
    });
  });

  /**
   * GET /api/files/tree?involved=src/index.ts,src/scene.ts
   */
  app.get('/tree', (c) => {
    const involvedParam = c.req.query('involved') ?? '';
    const involvedFiles = involvedParam
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    const tree = repoReader.buildFileTree(involvedFiles);
    return c.json({ tree });
  });

  return app;
}
