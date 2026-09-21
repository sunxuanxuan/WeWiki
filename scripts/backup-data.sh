#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DEFAULT_OUTPUT_DIR="$ROOT_DIR/dist/wewiki-data-$(date +"%Y%m%d-%H%M%S")"
OUTPUT_DIR="${1:-$DEFAULT_OUTPUT_DIR}"

read_env_value() {
  local key="$1"
  local env_file="$ROOT_DIR/.env"
  local line value

  [[ -f "$env_file" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" == "$key="* ]] || continue
    value="${line#*=}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    printf '%s' "$value"
    return 0
  done < "$env_file"

  return 1
}

DATABASE_URL="${DATABASE_URL:-$(read_env_value DATABASE_URL || true)}"
CONFIGURED_UPLOAD_DIR="${UPLOAD_DIR:-$(read_env_value UPLOAD_DIR || true)}"
CONFIGURED_UPLOAD_DIR="${CONFIGURED_UPLOAD_DIR:-uploads}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "错误：请通过环境变量或 .env 配置 DATABASE_URL。" >&2
  exit 1
fi

POSTGRES_URL="$(node -e 'const url = new URL(process.argv[1]); url.searchParams.delete("schema"); process.stdout.write(url.toString())' "$DATABASE_URL")"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "错误：未找到 pg_dump，请先安装 PostgreSQL 客户端。" >&2
  exit 1
fi

if [[ "$CONFIGURED_UPLOAD_DIR" = /* ]]; then
  UPLOAD_PATH="$CONFIGURED_UPLOAD_DIR"
else
  UPLOAD_PATH="$ROOT_DIR/$CONFIGURED_UPLOAD_DIR"
fi

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "错误：输出目录已存在：$OUTPUT_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR/files/uploads" "$OUTPUT_DIR/files/public"

cleanup_incomplete_backup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 && -d "$OUTPUT_DIR" ]]; then
    rm -rf -- "$OUTPUT_DIR"
  fi
  exit "$exit_code"
}
trap cleanup_incomplete_backup EXIT

echo "正在导出 PostgreSQL 数据库..."
pg_dump \
  --dbname="$POSTGRES_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$OUTPUT_DIR/database.dump"

if [[ -d "$UPLOAD_PATH" ]]; then
  echo "正在收集上传附件..."
  cp -R "$UPLOAD_PATH/." "$OUTPUT_DIR/files/uploads/"
fi

if [[ -d "$ROOT_DIR/public/imported-docs" ]]; then
  echo "正在收集旧版静态文档附件..."
  mkdir -p "$OUTPUT_DIR/files/public/imported-docs"
  cp -R "$ROOT_DIR/public/imported-docs/." "$OUTPUT_DIR/files/public/imported-docs/"
fi

DATABASE_BYTES="$(wc -c < "$OUTPUT_DIR/database.dump" | tr -d ' ')"
UPLOAD_FILE_COUNT="$(find "$OUTPUT_DIR/files/uploads" -type f | wc -l | tr -d ' ')"
PUBLIC_FILE_COUNT="$(find "$OUTPUT_DIR/files/public" -type f | wc -l | tr -d ' ')"

cat > "$OUTPUT_DIR/manifest.json" <<EOF
{
  "format": "wewiki-migration",
  "version": 1,
  "createdAt": "$TIMESTAMP",
  "database": {
    "file": "database.dump",
    "format": "postgresql-custom",
    "bytes": $DATABASE_BYTES
  },
  "files": {
    "uploads": $UPLOAD_FILE_COUNT,
    "publicImportedDocs": $PUBLIC_FILE_COUNT
  }
}
EOF

(
  cd "$OUTPUT_DIR"
  if command -v shasum >/dev/null 2>&1; then
    find . -type f ! -name checksums.sha256 -print0 \
      | sort -z \
      | xargs -0 shasum -a 256 > checksums.sha256
  elif command -v sha256sum >/dev/null 2>&1; then
    find . -type f ! -name checksums.sha256 -print0 \
      | sort -z \
      | xargs -0 sha256sum > checksums.sha256
  else
    echo "错误：未找到 shasum 或 sha256sum，无法生成完整性校验。" >&2
    exit 1
  fi
)

trap - EXIT
echo "数据备份完成：$OUTPUT_DIR"
echo "数据库：${DATABASE_BYTES} bytes；上传附件：${UPLOAD_FILE_COUNT}；旧版静态附件：${PUBLIC_FILE_COUNT}"
