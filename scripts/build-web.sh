#!/bin/bash
set -euo pipefail
# 0. 安装依赖(仅 web)
pnpm --filter @tracking-lineage/web install
echo "🔨 Building web..."

pnpm --filter @tracking-lineage/web build

rm -rf output/web
mkdir -p output/web
cp -r apps/web/dist/* output/web/

echo "✅ Web → output/web/"
ls -lh output/web/
