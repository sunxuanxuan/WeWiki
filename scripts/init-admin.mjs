#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import { hash } from "bcryptjs";
import pg from "pg";

const { Client } = pg;

function loadLocalEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

loadLocalEnv();

function getArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const email = (getArg("email") ?? process.env.INIT_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL)
  ?.trim()
  .toLowerCase();
const password = getArg("password") ?? process.env.INIT_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
const name = getArg("name") ?? process.env.INIT_ADMIN_NAME ?? process.env.ADMIN_NAME ?? "WeWiki Admin";
const resetPassword = hasFlag("reset-password") || process.env.INIT_ADMIN_RESET_PASSWORD === "true";
const createDefaultSpace = !hasFlag("skip-space") && process.env.INIT_ADMIN_SKIP_SPACE !== "true";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

if (!email || !password) {
  console.error(`Missing admin credentials.

Usage:
  pnpm init:admin -- --email=admin --password='1234567' [--name='Admin'] [--reset-password]

Environment variables are also supported:
  INIT_ADMIN_EMAIL=admin
  INIT_ADMIN_PASSWORD='1234567'
  INIT_ADMIN_NAME='Admin'
  INIT_ADMIN_RESET_PASSWORD=true
`);
  process.exit(1);
}


const client = new Client({ connectionString: databaseUrl });

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

try {
  await client.connect();
  await client.query("BEGIN");

  const existingUser = await client.query(
    "SELECT id, password_hash FROM users WHERE email = $1 FOR UPDATE",
    [email],
  );

  let userId;
  let action;

  if (existingUser.rowCount) {
    userId = existingUser.rows[0].id;
    action = "updated";

    if (resetPassword || !existingUser.rows[0].password_hash) {
      const passwordHash = await hash(password, 12);
      await client.query(
        `UPDATE users
         SET name = $2, password_hash = $3, global_role = 'super_admin', status = 'active', updated_at = NOW()
         WHERE id = $1`,
        [userId, name, passwordHash],
      );
    } else {
      await client.query(
        `UPDATE users
         SET name = COALESCE($2, name), global_role = 'super_admin', status = 'active', updated_at = NOW()
         WHERE id = $1`,
        [userId, name],
      );
    }
  } else {
    userId = newId("user");
    action = "created";
    const passwordHash = await hash(password, 12);

    await client.query(
      `INSERT INTO users (id, email, name, password_hash, global_role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'super_admin', 'active', NOW(), NOW())`,
      [userId, email, name, passwordHash],
    );
  }

  if (createDefaultSpace) {
    const existingSpace = await client.query(
      "SELECT id FROM spaces WHERE owner_id = $1 AND name = $2 AND deleted_at IS NULL LIMIT 1",
      [userId, "默认空间"],
    );

    const spaceId = existingSpace.rowCount ? existingSpace.rows[0].id : newId("space");

    if (!existingSpace.rowCount) {
      await client.query(
        `INSERT INTO spaces (id, name, description, owner_id, visibility, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'private', NOW(), NOW())`,
        [spaceId, "默认空间", "初始化管理员的默认个人知识库", userId],
      );
    }

    await client.query(
      `INSERT INTO space_members (id, space_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'owner', NOW(), NOW())
       ON CONFLICT (space_id, user_id)
       DO UPDATE SET role = 'owner', updated_at = NOW()`,
      [newId("member"), spaceId, userId],
    );
  }

  await client.query(
    `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
     VALUES ($1, $2, $3, 'user', $2, $4::jsonb, NOW())`,
    [
      newId("audit"),
      userId,
      `admin.${action}`,
      JSON.stringify({ source: "scripts/init-admin.mjs", email }),
    ],
  );

  await client.query("COMMIT");

  console.log(`Admin user ${action}: ${email}`);
  console.log(`Role/status: super_admin / active`);
  if (existingUser.rowCount && !resetPassword && existingUser.rows[0].password_hash) {
    console.log("Password was not changed. Use --reset-password to reset it.");
  }
  if (createDefaultSpace) {
    console.log("Default space ensured: 默认空间");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed to initialize admin user:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
