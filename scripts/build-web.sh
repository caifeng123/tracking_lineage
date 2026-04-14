#!/bin/bash
set -euo pipefail

echo "🔨 Building web..."

pnpm --filter @tracking-lineage/web build

rm -rf output/web
mkdir -p output/web
cp -r apps/web/dist/* output/web/

echo "✅ Web → output/web/"
ls -lh output/web/
