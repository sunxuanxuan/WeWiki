#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

function loadLocalEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function slugify(value) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `doc-${Date.now()}`;
}

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const docsDir = path.resolve(process.cwd(), "docs");
const markdownFiles = fs
  .readdirSync(docsDir)
  .filter((file) => file.endsWith(".md"))
  .sort();

if (markdownFiles.length === 0) {
  console.log("No Markdown files found in docs/.");
  process.exit(0);
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query("BEGIN");

  const adminResult = await client.query(
    "SELECT id, email, name FROM users WHERE email = $1 AND status = 'active' LIMIT 1",
    ["admin"],
  );

  if (!adminResult.rowCount) {
    throw new Error("Active admin user not found. Please run `pnpm init:admin -- --email=admin --password=1234567 --name=admin` first.");
  }

  const admin = adminResult.rows[0];

  let spaceResult = await client.query(
    "SELECT id FROM spaces WHERE owner_id = $1 AND name = '默认空间' AND deleted_at IS NULL LIMIT 1",
    [admin.id],
  );

  let spaceId;
  if (spaceResult.rowCount) {
    spaceId = spaceResult.rows[0].id;
  } else {
    spaceId = newId("space");
    await client.query(
      `INSERT INTO spaces (id, name, description, owner_id, visibility, created_at, updated_at)
       VALUES ($1, '默认空间', '默认个人知识库', $2, 'private', NOW(), NOW())`,
      [spaceId, admin.id],
    );
  }

  await client.query(
    `INSERT INTO space_members (id, space_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, 'owner', NOW(), NOW())
     ON CONFLICT (space_id, user_id)
     DO UPDATE SET role = 'owner', updated_at = NOW()`,
    [newId("member"), spaceId, admin.id],
  );

  const docsDirectorySlug = "imported-docs";
  const directoryResult = await client.query(
    `INSERT INTO notes (id, space_id, owner_id, parent_id, title, slug, content, content_format, status, visibility, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, NULL, 'docs', $4, '', 'directory', 'published', 'space', NOW(), NOW(), NULL)
     ON CONFLICT (space_id, slug)
     DO UPDATE SET title = 'docs', content_format = 'directory', deleted_at = NULL, updated_at = NOW()
     RETURNING id`,
    [newId("note"), spaceId, admin.id, docsDirectorySlug],
  );
  const docsDirectoryId = directoryResult.rows[0].id;

  const imported = [];

  for (const file of markdownFiles) {
    const filePath = path.join(docsDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const title = file.replace(/\.md$/i, "");
    const slug = `docs-${slugify(file)}`;

    const noteResult = await client.query(
      `INSERT INTO notes (id, space_id, owner_id, parent_id, title, slug, content, content_format, status, visibility, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'markdown', 'published', 'space', NOW(), NOW(), NULL)
       ON CONFLICT (space_id, slug)
       DO UPDATE SET owner_id = EXCLUDED.owner_id, parent_id = EXCLUDED.parent_id, title = EXCLUDED.title, content = EXCLUDED.content, content_format = 'markdown', status = 'published', visibility = 'space', deleted_at = NULL, updated_at = NOW()
       RETURNING id`,
      [newId("note"), spaceId, admin.id, docsDirectoryId, title, slug, content],
    );

    const noteId = noteResult.rows[0].id;

    await client.query(
      `INSERT INTO note_revisions (id, note_id, editor_id, title, content, change_summary, created_at)
       VALUES ($1, $2, $3, $4, $5, '从 docs 目录导入 Markdown 文档', NOW())`,
      [newId("revision"), noteId, admin.id, title, content],
    );

    await client.query(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES ($1, $2, 'note.imported_from_docs', 'note', $3, $4::jsonb, NOW())`,
      [newId("audit"), admin.id, noteId, JSON.stringify({ source: "scripts/import-docs.mjs", file })],
    );

    imported.push({ title, noteId, bytes: Buffer.byteLength(content, "utf8") });
  }

  await client.query("COMMIT");

  console.log(`Imported ${imported.length} Markdown document(s) as admin into 默认空间 / docs:`);
  for (const item of imported) {
    console.log(`- ${item.title} (${item.bytes} bytes) -> ${item.noteId}`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed to import docs:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
