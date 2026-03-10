import { serve } from '@hono/node-server';
import { createApp, type ServerConfig } from './app.js';

export function startServer(config: ServerConfig & { port?: number; open?: boolean }): void {
  const port = config.port ?? 3000;
  const app = createApp(config);

  console.log('');
  console.log('  tracking-lineage viewer');
  console.log(`  目标仓库: ${config.targetDir}`);
  console.log(`  结果目录: ${config.resultDir}`);
  console.log(`  地址:     http://localhost:${port}`);
  console.log('');

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`  服务已启动: http://localhost:${info.port}`);

    if (config.open !== false) {
      import('open').then((mod) => {
        mod.default(`http://localhost:${info.port}`).catch(() => {});
      }).catch(() => {
        // open 不是必须的
      });
    }
  });
}
