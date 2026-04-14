#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"

# CI 注入 .env
if [ -n "${ENV_CONTENT:-}" ]; then
  echo "$ENV_CONTENT" > .env
  echo "📝 .env injected from CI secrets"
fi


echo "🚀 Starting tracking-lineage on :$PORT ..."
PORT="$PORT" node dist/index.js