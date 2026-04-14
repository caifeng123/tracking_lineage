#!/bin/bash
set -euo pipefail

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

echo ""
echo "✅ Server → output/server/"
echo ""
echo "产物结构:"
find output/server -maxdepth 2 -not -path '*/node_modules/*' | head -30
echo ""
echo "部署启动:"
echo "  cd output/server && ./deploy-server.sh"
echo "  cd output/server && PORT=8080 ./deploy-server.sh"
