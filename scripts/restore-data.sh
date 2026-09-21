#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/migration-data"
FORCE=false

usage() {
  cat <<'EOF'
用法：
  bash scripts/restore-data.sh [备份目录] [--force]

默认读取项目根目录下的 migration-data。
目标数据库已有业务表时会拒绝恢复；确认需要覆盖时请显式传入 --force。
EOF
}

for argument in "$@"; do
  case "$argument" in
    --) ;;
    --force) FORCE=true ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "错误：未知参数 $argument" >&2; usage >&2; exit 1 ;;
    *) BACKUP_DIR="$argument" ;;
  esac
done

if [[ "$BACKUP_DIR" != /* ]]; then
  BACKUP_DIR="$(pwd)/$BACKUP_DIR"
fi

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
  echo "错误：请先在目标环境通过环境变量或 .env 配置 DATABASE_URL。" >&2
  exit 1
fi

POSTGRES_URL="$(node -e 'const url = new URL(process.argv[1]); url.searchParams.delete("schema"); process.stdout.write(url.toString())' "$DATABASE_URL")"

for command_name in pg_restore psql pnpm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "错误：未找到 ${command_name}，请先安装 PostgreSQL 客户端。" >&2
    exit 1
  fi
done

for required_file in manifest.json database.dump checksums.sha256; do
  if [[ ! -f "$BACKUP_DIR/$required_file" ]]; then
    echo "错误：备份不完整，缺少 ${required_file}：${BACKUP_DIR}" >&2
    exit 1
  fi
done

if ! grep -q '"format": "wewiki-migration"' "$BACKUP_DIR/manifest.json"; then
  echo "错误：不是受支持的 WeWiki 迁移备份。" >&2
  exit 1
fi

echo "正在校验备份完整性..."
(
  cd "$BACKUP_DIR"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c checksums.sha256
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c checksums.sha256
  else
    echo "错误：未找到 shasum 或 sha256sum，无法校验备份。" >&2
    exit 1
  fi
)

PUBLIC_TABLE_COUNT="$(psql "$POSTGRES_URL" -X -q -t -A -c "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';" | tr -d '[:space:]')"
PUBLIC_TABLE_COUNT="${PUBLIC_TABLE_COUNT:-0}"

if [[ "$PUBLIC_TABLE_COUNT" != "0" && "$FORCE" != true ]]; then
  echo "错误：目标数据库 public schema 中已有 ${PUBLIC_TABLE_COUNT} 张表。" >&2
  echo "如确认要覆盖，请重新执行并增加 --force。" >&2
  exit 1
fi

if [[ "$FORCE" == true && "$PUBLIC_TABLE_COUNT" != "0" ]]; then
  echo "正在清理目标数据库 public schema..."
  psql "$POSTGRES_URL" -X -v ON_ERROR_STOP=1 \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
fi

if [[ "$CONFIGURED_UPLOAD_DIR" = /* ]]; then
  UPLOAD_PATH="$CONFIGURED_UPLOAD_DIR"
else
  UPLOAD_PATH="$ROOT_DIR/$CONFIGURED_UPLOAD_DIR"
fi

mkdir -p "$UPLOAD_PATH" "$ROOT_DIR/public/imported-docs"

echo "正在恢复 PostgreSQL 数据库..."
RESTORE_ARGS=(
  --dbname="$POSTGRES_URL"
  --no-owner
  --no-privileges
  --exit-on-error
)
pg_restore "${RESTORE_ARGS[@]}" "$BACKUP_DIR/database.dump"

echo "正在应用备份之后新增的数据库迁移..."
(
  cd "$ROOT_DIR"
  DATABASE_URL="$DATABASE_URL" pnpm exec prisma migrate deploy
)

if [[ -d "$BACKUP_DIR/files/uploads" ]]; then
  echo "正在恢复上传附件..."
  cp -R "$BACKUP_DIR/files/uploads/." "$UPLOAD_PATH/"
fi

if [[ -d "$BACKUP_DIR/files/public/imported-docs" ]]; then
  echo "正在恢复旧版静态文档附件..."
  cp -R "$BACKUP_DIR/files/public/imported-docs/." "$ROOT_DIR/public/imported-docs/"
fi

NOTE_COUNT="$(psql "$POSTGRES_URL" -X -q -t -A -c "SELECT count(*) FROM notes WHERE deleted_at IS NULL;" | tr -d '[:space:]')"
ATTACHMENT_COUNT="$(psql "$POSTGRES_URL" -X -q -t -A -c "SELECT count(*) FROM attachments WHERE deleted_at IS NULL;" | tr -d '[:space:]')"

echo "恢复完成：有效文档 ${NOTE_COUNT} 篇，附件记录 ${ATTACHMENT_COUNT} 条。"
echo "请执行 pnpm db:generate，并确认目标环境已配置 NEXTAUTH_SECRET。"
