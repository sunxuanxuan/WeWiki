-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('user', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "SpaceVisibility" AS ENUM ('private', 'shared');

-- CreateEnum
CREATE TYPE "SpaceRole" AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('private', 'space', 'shared');

-- CreateEnum
CREATE TYPE "NoteRole" AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('image', 'document', 'pdf', 'mindmap', 'archive', 'other');

-- CreateEnum
CREATE TYPE "PreviewType" AS ENUM ('html', 'pdf', 'text');

-- CreateEnum
CREATE TYPE "PreviewStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT,
    "avatar_url" TEXT,
    "global_role" "GlobalRole" NOT NULL DEFAULT 'user',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" TEXT NOT NULL,
    "visibility" "SpaceVisibility" NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_members" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL DEFAULT 'viewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "space_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "content_format" TEXT NOT NULL DEFAULT 'markdown',
    "status" "NoteStatus" NOT NULL DEFAULT 'draft',
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'space',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_permissions" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "NoteRole" NOT NULL DEFAULT 'viewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "note_id" TEXT,
    "space_id" TEXT,
    "uploader_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_ext" TEXT,
    "file_size" INTEGER NOT NULL,
    "file_kind" "FileKind" NOT NULL DEFAULT 'other',
    "checksum" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_previews" (
    "id" TEXT NOT NULL,
    "attachment_id" TEXT NOT NULL,
    "preview_type" "PreviewType" NOT NULL,
    "status" "PreviewStatus" NOT NULL DEFAULT 'pending',
    "storage_key" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_tags" (
    "note_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "note_tags_pkey" PRIMARY KEY ("note_id","tag_id")
);

-- CreateTable
CREATE TABLE "note_revisions" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "editor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "change_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "spaces_owner_id_idx" ON "spaces"("owner_id");

-- CreateIndex
CREATE INDEX "space_members_user_id_idx" ON "space_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "space_members_space_id_user_id_key" ON "space_members"("space_id", "user_id");

-- CreateIndex
CREATE INDEX "notes_space_id_idx" ON "notes"("space_id");

-- CreateIndex
CREATE INDEX "notes_owner_id_idx" ON "notes"("owner_id");

-- CreateIndex
CREATE INDEX "notes_parent_id_idx" ON "notes"("parent_id");

-- CreateIndex
CREATE INDEX "notes_updated_at_idx" ON "notes"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "notes_space_id_slug_key" ON "notes"("space_id", "slug");

-- CreateIndex
CREATE INDEX "note_permissions_user_id_idx" ON "note_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "note_permissions_note_id_user_id_key" ON "note_permissions"("note_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_note_id_idx" ON "attachments"("note_id");

-- CreateIndex
CREATE INDEX "attachments_space_id_idx" ON "attachments"("space_id");

-- CreateIndex
CREATE INDEX "attachments_uploader_id_idx" ON "attachments"("uploader_id");

-- CreateIndex
CREATE INDEX "document_previews_attachment_id_idx" ON "document_previews"("attachment_id");

-- CreateIndex
CREATE INDEX "tags_space_id_idx" ON "tags"("space_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_space_id_name_key" ON "tags"("space_id", "name");

-- CreateIndex
CREATE INDEX "note_revisions_note_id_idx" ON "note_revisions"("note_id");

-- CreateIndex
CREATE INDEX "note_revisions_editor_id_idx" ON "note_revisions"("editor_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_permissions" ADD CONSTRAINT "note_permissions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_permissions" ADD CONSTRAINT "note_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_previews" ADD CONSTRAINT "document_previews_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
