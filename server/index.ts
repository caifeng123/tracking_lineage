import { serve } from '@hono/node-server';
import { createApp } from './app.js';

export function startServer(config: { port?: number; open?: boolean }): void {
  const port = config.port ?? 3000;
  const app = createApp();

  console.log('');
  console.log('  tracking-lineage 分析管理平台');
  console.log(`  地址: http://localhost:${port}`);
  console.log('');

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`  服务已启动: http://localhost:${info.port}`);

    if (config.open !== false) {
      import('open').then((mod) => {
        mod.default(`http://localhost:${info.port}`).catch(() => {});
      }).catch(() => {});
    }
  });
}
