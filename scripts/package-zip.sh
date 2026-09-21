#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IGNORE_FILE="$ROOT_DIR/.zipignore"
OUTPUT_DIR="$ROOT_DIR/dist"
PROJECT_NAME="$(basename "$ROOT_DIR")"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
ARCHIVE_NAME="${1:-${PROJECT_NAME}-${TIMESTAMP}.zip}"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/wewiki-package.XXXXXX")"
MIGRATION_DIR="$STAGING_ROOT/migration-data"

cleanup() {
  rm -rf -- "$STAGING_ROOT"
}
trap cleanup EXIT

if ! command -v zip >/dev/null 2>&1; then
  echo "错误：当前环境未安装 zip 命令。" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$ARCHIVE_PATH"

echo "正在生成与当前 schema 匹配的 Prisma Client..."
(
  cd "$ROOT_DIR"
  pnpm exec prisma generate
)

bash "$ROOT_DIR/scripts/backup-data.sh" "$MIGRATION_DIR"

declare -a ZIP_EXCLUDES=()

if [[ -f "$IGNORE_FILE" ]]; then
  while IFS= read -r pattern; do
    [[ -z "$pattern" || "$pattern" =~ ^# ]] && continue
    ZIP_EXCLUDES+=(-x "$pattern")
  done < "$IGNORE_FILE"
fi

cd "$ROOT_DIR"

echo "开始打包：$ARCHIVE_PATH"
zip -r "$ARCHIVE_PATH" . "${ZIP_EXCLUDES[@]}"
(
  cd "$STAGING_ROOT"
  zip -r "$ARCHIVE_PATH" migration-data
)
echo "打包完成：$ARCHIVE_PATH"
echo "压缩包包含代码、设计文档、数据库备份和附件；完整数据位于 migration-data/。"
