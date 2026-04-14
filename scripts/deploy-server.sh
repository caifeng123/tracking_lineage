#!/bin/bash
# 部署并启动 tracking-lineage 服务（PM2 管理）
# 此脚本由 build-server.sh 复制到 output/server/ 中，在产物目录下直接运行

set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
APP_NAME="tracking-lineage"

# 注入 .env（CI 通过环境变量 ENV_CONTENT 传入）
if [ -n "${ENV_CONTENT:-}" ]; then
  echo "$ENV_CONTENT" > .env
  echo "📝 .env injected from CI secrets"
fi

# PM2 启动 / 重启
if ! command -v pm2 &> /dev/null; then
  echo "❌ PM2 not found. Install: npm install -g pm2"
  exit 1
fi

pm2 delete "$APP_NAME" 2>/dev/null || true
PORT="$PORT" NO_OPEN=true pm2 start dist/index.js --name "$APP_NAME"
pm2 save

echo "✅ $APP_NAME started on :$PORT (PM2 managed)"
echo ""
echo "常用命令:"
echo "  pm2 logs $APP_NAME       # 查看日志"
echo "  pm2 restart $APP_NAME    # 重启"
echo "  pm2 stop $APP_NAME       # 停止"
