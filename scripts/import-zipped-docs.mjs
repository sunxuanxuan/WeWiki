#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
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

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const projectRoot = process.cwd();
const docsDir = path.join(projectRoot, "docs");
const publicDir = path.join(projectRoot, "public", "imported-docs");
fs.mkdirSync(publicDir, { recursive: true });

const pythonCode = String.raw`
import json, re, shutil, sys, zipfile
from pathlib import Path
from urllib.parse import quote

docs_dir = Path(sys.argv[1])
public_dir = Path(sys.argv[2])
temp_root = Path('/tmp/wewiki_zip_import')
if temp_root.exists():
    shutil.rmtree(temp_root)
temp_root.mkdir(parents=True, exist_ok=True)

image_exts = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
doc_exts = {'.xlsx', '.xls', '.csv', '.doc', '.docx', '.pdf', '.ppt', '.pptx'}

def fix(name: str) -> str:
    try:
        return name.encode('cp437').decode('gbk')
    except Exception:
        return name

def public_url(slug: str, rel_path: Path) -> str:
    parts = ['imported-docs', slug] + [quote(part) for part in rel_path.as_posix().split('/')]
    return '/' + '/'.join(parts)

def extract_zip(zip_path: Path, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = fix(info.filename)
            target = dest / name
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, 'wb') as dst:
                shutil.copyfileobj(src, dst)
            if target.suffix.lower() == '.zip':
                extract_zip(target, target.with_suffix(''))

results = []
for zip_path in sorted(docs_dir.glob('*.zip')):
    extract_root = temp_root / zip_path.stem
    extract_zip(zip_path, extract_root)
    md_files = sorted(extract_root.rglob('*.md'))
    if not md_files:
        continue
    md_path = md_files[0]
    title = md_path.stem
    slug = re.sub(r'[^\w\-\u4e00-\u9fff]+', '-', title.lower()).strip('-') or zip_path.stem
    asset_dir = md_path.parent / 'assets'
    target_public_dir = public_dir / slug
    if target_public_dir.exists():
        shutil.rmtree(target_public_dir)
    target_public_dir.mkdir(parents=True, exist_ok=True)

    asset_count = 0
    if asset_dir.exists():
        for file in asset_dir.rglob('*'):
            if file.is_file():
                relative = file.relative_to(asset_dir)
                target = target_public_dir / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, target)
                asset_count += 1

    content = md_path.read_text('utf-8', errors='replace')

    def replace_image(match):
        alt = match.group(1) or '附件'
        raw_path = match.group(2)
        rel = Path(raw_path.replace('assets/', '', 1))
        suffix = rel.suffix.lower()
        url = public_url(slug, rel)
        if suffix in doc_exts:
            label = alt if alt != 'preview' else rel.name
            return f'[{label}]({url})'
        return f'![{alt}]({url})'

    content = re.sub(r'!\[([^\]]*)\]\((assets/[^)]+)\)', replace_image, content)
    content = re.sub(
        r'(?<!!)\((assets/[^)]+)\)',
        lambda m: f'({public_url(slug, Path(m.group(1).replace("assets/", "", 1)))})',
        content,
    )

    results.append({
        'zip_name': zip_path.name,
        'title': title,
        'slug': f'docs-{slug}',
        'content': content,
        'asset_count': asset_count,
        'source_md': str(md_path.relative_to(extract_root)),
    })

print(json.dumps(results, ensure_ascii=False))
`;

const extractedDocs = JSON.parse(
  execFileSync("python3", ["-c", pythonCode, docsDir, publicDir], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }),
);

if (!Array.isArray(extractedDocs) || extractedDocs.length === 0) {
  console.log("No nested zipped Markdown documents found to import.");
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
    throw new Error("Active admin user not found. Please initialize the admin account first.");
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

  const docsDirectoryResult = await client.query(
    `INSERT INTO notes (id, space_id, owner_id, parent_id, title, slug, content, content_format, status, visibility, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, NULL, 'docs', 'imported-docs', '', 'directory', 'published', 'space', NOW(), NOW(), NULL)
     ON CONFLICT (space_id, slug)
     DO UPDATE SET title = 'docs', content_format = 'directory', deleted_at = NULL, updated_at = NOW()
     RETURNING id`,
    [newId("note"), spaceId, admin.id],
  );
  const docsDirectoryId = docsDirectoryResult.rows[0].id;

  const summary = [];

  for (const doc of extractedDocs) {
    const existing = await client.query(
      `SELECT id, slug FROM notes
       WHERE space_id = $1
         AND (slug = $2 OR (parent_id = $3 AND title = $4))
       LIMIT 1`,
      [spaceId, doc.slug, docsDirectoryId, doc.title],
    );

    let noteId;
    if (existing.rowCount) {
      noteId = existing.rows[0].id;
      await client.query(
        `UPDATE notes
         SET owner_id = $2,
             parent_id = $3,
             title = $4,
             content = $5,
             content_format = 'markdown',
             status = 'published',
             visibility = 'space',
             deleted_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [noteId, admin.id, docsDirectoryId, doc.title, doc.content],
      );
    } else {
      noteId = newId("note");
      await client.query(
        `INSERT INTO notes (id, space_id, owner_id, parent_id, title, slug, content, content_format, status, visibility, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'markdown', 'published', 'space', NOW(), NOW(), NULL)`,
        [noteId, spaceId, admin.id, docsDirectoryId, doc.title, doc.slug, doc.content],
      );
    }

    await client.query(
      `INSERT INTO note_revisions (id, note_id, editor_id, title, content, change_summary, created_at)
       VALUES ($1, $2, $3, $4, $5, '从压缩包导入 Markdown 文档及附件', NOW())`,
      [newId("revision"), noteId, admin.id, doc.title, doc.content],
    );

    await client.query(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES ($1, $2, 'note.imported_from_zip', 'note', $3, $4::jsonb, NOW())`,
      [
        newId("audit"),
        admin.id,
        noteId,
        JSON.stringify({
          source: "scripts/import-zipped-docs.mjs",
          zipName: doc.zip_name,
          sourceMd: doc.source_md,
          assetCount: doc.asset_count,
        }),
      ],
    );

    summary.push({ title: doc.title, noteId, assets: doc.asset_count, zipName: doc.zip_name });
  }

  await client.query("COMMIT");

  console.log(`Imported ${summary.length} zipped Markdown document(s) into 默认空间 / docs:`);
  for (const item of summary) {
    console.log(`- ${item.title} | assets: ${item.assets} | source: ${item.zipName} | noteId: ${item.noteId}`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed to import zipped docs:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
