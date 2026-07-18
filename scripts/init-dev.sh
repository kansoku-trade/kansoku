#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PRO_REPO_URL="git@github.com:Innei/kansoku-pro.git"

echo "== init-dev: 1/5 检查 Node/pnpm =="

if ! command -v node > /dev/null 2>&1; then
  echo "错误：没有找到 node，请先安装 Node.js（建议 LTS 版本）后重试" >&2
  exit 1
fi
node_version="$(node -v | sed 's/^v//')"
node_major="${node_version%%.*}"
if [ "$node_major" -lt 20 ]; then
  echo "错误：当前 node 版本 v$node_version 过低，需要 v20 及以上" >&2
  exit 1
fi
echo "node v$node_version OK"

if ! command -v pnpm > /dev/null 2>&1; then
  echo "错误：没有找到 pnpm，请先安装（推荐 corepack enable 或 npm i -g pnpm）后重试" >&2
  exit 1
fi
pnpm_version="$(pnpm -v)"
required_pnpm="$(node -pe "require('$ROOT_DIR/package.json').packageManager" 2> /dev/null | sed -E 's/^pnpm@//')"
required_major="${required_pnpm%%.*}"
pnpm_major="${pnpm_version%%.*}"
if [ -n "$required_pnpm" ] && [ "$pnpm_major" != "$required_major" ]; then
  echo "警告：当前 pnpm 版本 $pnpm_version，与 package.json 声明的 pnpm@$required_pnpm 主版本不一致，可能遇到诡异问题" >&2
else
  echo "pnpm $pnpm_version OK"
fi

echo "== init-dev: 2/5 同步 pro 仓库（可选） =="
export KANSOKU_PRO_REPO_URL="${KANSOKU_PRO_REPO_URL:-$DEFAULT_PRO_REPO_URL}"
if "$ROOT_DIR/scripts/fetch-pro.sh"; then
  echo "pro 仓库同步完成"
else
  echo "提示：pro 仓库拉取失败（没有权限或网络不通），进入免费模式，继续初始化" >&2
fi

echo "== init-dev: 3/5 安装依赖 =="
(cd "$ROOT_DIR" && pnpm install)

echo "== init-dev: 4/5 typecheck 冒烟 =="
if (cd "$ROOT_DIR" && pnpm -r typecheck); then
  echo "typecheck 通过"
else
  echo "警告：typecheck 未通过，先看 apps/README.md 排查，不影响继续开发" >&2
fi

echo "== init-dev: 5/5 完成 =="
cat << 'EOF'

下一步：
  pnpm dev        # 起本地开发环境，http://localhost:5199
  pnpm dev:desktop  # 桌面壳（Electron），不需要单独的 server 进程

.env 说明：
  - 仓库根目录的 .env 给 Python 技能用（FRED_API_KEY、SEC_USER_AGENT 等），见根 CLAUDE.md
  - 应用内 AI 模型/密钥走 /settings 页面存 SQLite；.env 里的 AI_*_MODEL / *_API_KEY 只在首次启动时一次性导入，之后可删
  - 需要接 pro 仓库时设置 KANSOKU_PRO_REPO_URL 环境变量后重跑本脚本即可
EOF
