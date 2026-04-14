import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = parseInt(process.env.PORT ?? '3000', 10);

const app = createApp();

console.log('');
console.log('  tracking-lineage API 服务');
console.log(`  地址: http://localhost:${port}`);
console.log('');

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`  服务已启动: http://localhost:${info.port}`);
});
