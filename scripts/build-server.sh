#!/bin/bash
set -euo pipefail

# 0. 安装依赖(仅 core + server)
pnpm --filter @tracking-lineage/core --filter @tracking-lineage/server install
echo "🔨 Building server + CLI..."
# 1. 编译 TS
pnpm --filter @tracking-lineage/core build
pnpm --filter @tracking-lineage/server build

# 2. pnpm deploy: 把 server 及其 workspace 依赖 + 生产 node_modules 打平到 output
rm -rf output/server
pnpm --filter @tracking-lineage/server deploy output/server --prod

# 3. 复制部署脚本到产物目录
cp scripts/deploy-server.sh output/server/deploy-server.sh
chmod +x output/server/deploy-server.sh
