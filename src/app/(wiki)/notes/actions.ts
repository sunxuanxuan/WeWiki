"use server";

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NoteVisibility, SpaceRole } from "@/generated/prisma/enums";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseBatchImportArchives, parseImportedDocument, rewriteMarkdownAssetUrls } from "@/lib/imported-document";
import { allowedMimeTypes, detectFileKind, uploadDir } from "@/lib/storage";

const createItemSchema = z.object({
  type: z.enum(["directory", "document"]),
  title: z.string().trim().max(120).optional(),
  spaceId: z.string().trim().min(1).optional(),
  parentId: z.string().trim().min(1).optional(),
  documentSource: z.enum(["blank", "upload"]).optional(),
});

const batchImportSchema = z.object({
  spaceId: z.string().trim().min(1).optional(),
  parentId: z.string().trim().min(1).optional(),
});

const deleteDirectorySchema = z.object({
  directoryId: z.string().trim().min(1),
});

const deleteDocumentSchema = z.object({
  documentId: z.string().trim().min(1),
});

const trashNoteSchema = z.object({
  noteId: z.string().trim().min(1),
});

const moveDirectorySchema = z.object({
  directoryId: z.string().trim().min(1),
  targetKind: z.enum(["space", "directory"]),
  targetId: z.string().trim().min(1),
});

const moveDocumentSchema = z.object({
  documentId: z.string().trim().min(1),
  targetKind: z.enum(["space", "directory"]),
  targetId: z.string().trim().min(1),
});

const updateDocumentSchema = z.object({
  documentId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
  content: z.string().max(200_000),
});

function slugify(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return base || `note-${Date.now()}`;
}

async function getCurrentUserId() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return session.user.id;
}

async function ensureDefaultSpace(userId: string) {
  const existing = await prisma.space.findFirst({
    where: {
      ownerId: userId,
      deletedAt: null,
      name: "默认空间",
    },
    select: { id: true },
  });

  if (existing) return existing;

  const space = await prisma.space.create({
    data: {
      name: "默认空间",
      description: "默认个人知识库",
      ownerId: userId,
      members: {
        create: {
          userId,
          role: SpaceRole.OWNER,
        },
      },
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "space.default_created",
      targetType: "space",
      targetId: space.id,
      metadata: { source: "notes/actions.ensureDefaultSpace" },
    },
  });

  return space;
}

async function canWriteSpace(userId: string, spaceId: string) {
  const space = await prisma.space.findFirst({
    where: {
      id: spaceId,
      deletedAt: null,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, role: { in: [SpaceRole.OWNER, SpaceRole.ADMIN, SpaceRole.EDITOR] } } } },
      ],
    },
    select: { id: true },
  });

  return Boolean(space);
}

async function requireWritableDirectory(userId: string, directoryId: string) {
  const directory = await prisma.note.findFirst({
    where: {
      id: directoryId,
      deletedAt: null,
      contentFormat: "directory",
      space: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: [SpaceRole.OWNER, SpaceRole.ADMIN, SpaceRole.EDITOR] } } } },
        ],
      },
    },
    select: { id: true, title: true, parentId: true, spaceId: true },
  });

  if (!directory) {
    throw new Error("目录不存在或没有权限。");
  }

  return directory;
}

async function requireWritableDocument(userId: string, documentId: string) {
  const document = await prisma.note.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      NOT: { contentFormat: "directory" },
      space: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: [SpaceRole.OWNER, SpaceRole.ADMIN, SpaceRole.EDITOR] } } } },
        ],
      },
    },
    select: { id: true, title: true, content: true, spaceId: true, parentId: true },
  });

  if (!document) {
    throw new Error("文档不存在或没有权限。");
  }

  return document;
}

async function collectDescendantNoteIds(rootId: string, includeDeleted = false) {
  const ids = [rootId];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await prisma.note.findMany({
      where: {
        parentId: { in: frontier },
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: { id: true },
    });

    frontier = children.map((child) => child.id);
    ids.push(...frontier);
  }

  return ids;
}

async function collectDescendantNotes(rootId: string) {
  const notes: Array<{ id: string; parentId: string | null; contentFormat: string }> = [];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const batch = await prisma.note.findMany({
      where: { id: { in: frontier } },
      select: { id: true, parentId: true, contentFormat: true },
    });

    notes.push(...batch);

    const children = await prisma.note.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });

    frontier = children.map((child) => child.id);
  }

  return notes;
}

async function requireTrashNote(userId: string, noteId: string) {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      deletedAt: { not: null },
      space: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: [SpaceRole.OWNER, SpaceRole.ADMIN, SpaceRole.EDITOR] } } } },
        ],
      },
    },
    select: { id: true, title: true, parentId: true, spaceId: true, contentFormat: true, deletedAt: true },
  });

  if (!note) {
    throw new Error("回收站项目不存在或没有权限。");
  }

  return note;
}

async function hardDeleteNoteTree(userId: string, noteId: string, action = "note.permanently_deleted") {
  const note = await requireTrashNote(userId, noteId);
  const subtree = note.contentFormat === "directory" ? await collectDescendantNotes(note.id) : [{ id: note.id, parentId: note.parentId, contentFormat: note.contentFormat }];
  const ids = Array.from(new Set(subtree.map((item) => item.id)));

  const attachments = await prisma.attachment.findMany({
    where: { noteId: { in: ids } },
    select: { storageKey: true },
  });

  await prisma.$transaction([
    prisma.note.updateMany({
      where: { parentId: { in: ids } },
      data: { parentId: null },
    }),
    prisma.note.deleteMany({
      where: { id: { in: ids } },
    }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action,
        targetType: "note",
        targetId: note.id,
        metadata: {
          title: note.title,
          affectedNoteCount: ids.length,
          deletedAt: note.deletedAt,
        },
      },
    }),
  ]);

  await Promise.all(
    attachments.map((attachment) =>
      rm(path.join(uploadDir, attachment.storageKey), { force: true }).catch(() => undefined),
    ),
  );

  return { noteId: note.id, affectedNoteCount: ids.length };
}

async function resolveTarget(userId: string, spaceId?: string, parentId?: string) {
  if (parentId) {
    const parent = await prisma.note.findFirst({
      where: {
        id: parentId,
        deletedAt: null,
        contentFormat: "directory",
        space: {
          deletedAt: null,
          OR: [
            { ownerId: userId },
            { members: { some: { userId, role: { in: [SpaceRole.OWNER, SpaceRole.ADMIN, SpaceRole.EDITOR] } } } },
          ],
        },
      },
      select: { id: true, spaceId: true },
    });

    if (!parent) {
      throw new Error("目标目录不存在或没有权限。");
    }

    return { spaceId: parent.spaceId, parentId: parent.id };
  }

  if (spaceId && (await canWriteSpace(userId, spaceId))) {
    return { spaceId, parentId: null };
  }

  const defaultSpace = await ensureDefaultSpace(userId);
  return { spaceId: defaultSpace.id, parentId: null };
}

export async function createWikiItem(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = createItemSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title") || undefined,
    spaceId: formData.get("spaceId") || undefined,
    parentId: formData.get("parentId") || undefined,
    documentSource: formData.get("documentSource") || undefined,
  });

  if (!parsed.success) {
    throw new Error("请输入有效的名称。");
  }

  const { type } = parsed.data;
  const target = await resolveTarget(userId, parsed.data.spaceId, parsed.data.parentId);
  const rawFile = formData.get("sourceFile");
  const uploadedFile = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;

  if (uploadedFile && !allowedMimeTypes.has(uploadedFile.type || "text/plain")) {
    const lowerName = uploadedFile.name.toLowerCase();
    if (!lowerName.endsWith(".zip") && !lowerName.endsWith(".md")) {
      throw new Error("仅支持上传 .md 或 .zip 文件。");
    }
  }

  if (type === "directory") {
    const title = parsed.data.title?.trim();
    if (!title) {
      throw new Error("请输入目录名称。");
    }

    const baseSlug = slugify(title);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const note = await prisma.note.create({
      data: {
        spaceId: target.spaceId,
        ownerId: userId,
        parentId: target.parentId,
        title,
        slug,
        content: "",
        contentFormat: "directory",
        visibility: NoteVisibility.SPACE,
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "directory.created",
        targetType: "note",
        targetId: note.id,
        metadata: { spaceId: target.spaceId, parentId: target.parentId },
      },
    });

    revalidatePath("/notes");
    return { id: note.id };
  }

  const documentSource = parsed.data.documentSource ?? (uploadedFile ? "upload" : "blank");
  let documentTitle = parsed.data.title?.trim() ?? "";
  let documentContent = "";
  let importedSource: "blank" | "markdown" | "zip" = "blank";
  let importedFileName: string | undefined;
  let importedAssets: Awaited<ReturnType<typeof parseImportedDocument>>["assets"] = [];

  if (documentSource === "upload") {
    if (!uploadedFile) {
      throw new Error("请选择要导入的 .md 或 .zip 文件。");
    }

    const imported = await parseImportedDocument(uploadedFile);
    documentTitle = documentTitle || imported.title;
    documentContent = imported.content;
    importedSource = imported.source;
    importedFileName = imported.sourceFileName;
    importedAssets = imported.assets;
  } else {
    if (!documentTitle) {
      throw new Error("请输入文档标题。");
    }
  }

  if (!documentTitle) {
    throw new Error("无法从上传文件中识别文档标题，请手动输入标题。");
  }

  const contentFormat = "markdown";
  const baseSlug = slugify(documentTitle);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;
  const note = await prisma.note.create({
    data: {
      spaceId: target.spaceId,
      ownerId: userId,
      parentId: target.parentId,
      title: documentTitle,
      slug,
      content: "",
      contentFormat,
      visibility: NoteVisibility.SPACE,
    },
    select: { id: true },
  });

  const writtenFiles: string[] = [];

  try {
    const attachmentsByPath = new Map<string, { id: string; renderAsLink: boolean; label: string }>();

    for (const asset of importedAssets) {
      const safeRelativePath = asset.relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter((segment) => segment && segment !== "." && segment !== "..")
        .join("/");

      if (!safeRelativePath) continue;

      const storageKey = path.join("notes", note.id, `${randomUUID()}-${safeRelativePath}`).replaceAll("\\", "/");
      const absolutePath = path.join(uploadDir, storageKey);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, asset.buffer);
      writtenFiles.push(absolutePath);

      const attachment = await prisma.attachment.create({
        data: {
          noteId: note.id,
          spaceId: target.spaceId,
          uploaderId: userId,
          originalName: asset.originalName,
          storageKey,
          mimeType: asset.mimeType,
          fileExt: asset.fileExt,
          fileSize: asset.fileSize,
          fileKind: detectFileKind(asset.mimeType),
          metadata: {
            relativePath: safeRelativePath,
            source: "zip-import",
          },
        },
        select: { id: true },
      });

      attachmentsByPath.set(safeRelativePath, {
        id: attachment.id,
        renderAsLink: asset.renderAsLink,
        label: asset.originalName,
      });
    }

    const finalContent = rewriteMarkdownAssetUrls(documentContent, note.id, attachmentsByPath);

    await prisma.$transaction([
      prisma.note.update({
        where: { id: note.id },
        data: {
          title: documentTitle,
          content: finalContent,
        },
      }),
      prisma.noteRevision.create({
        data: {
          noteId: note.id,
          editorId: userId,
          title: documentTitle,
          content: finalContent,
          changeSummary:
            importedSource === "blank"
              ? "创建文档"
              : importedSource === "markdown"
                ? "导入 Markdown 文档"
                : "导入压缩包文档",
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: userId,
          action: importedSource === "blank" ? "note.created" : "note.imported",
          targetType: "note",
          targetId: note.id,
          metadata: {
            spaceId: target.spaceId,
            parentId: target.parentId,
            source: importedSource,
            sourceFileName: importedFileName,
            assetCount: importedAssets.length,
          },
        },
      }),
    ]);
  } catch (error) {
    await prisma.attachment.deleteMany({ where: { noteId: note.id } }).catch(() => undefined);
    await prisma.note.delete({ where: { id: note.id } }).catch(() => undefined);
    await Promise.all(writtenFiles.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
    throw error;
  }

  revalidatePath("/notes");
  revalidatePath(`/notes/${note.id}`);
  return { id: note.id };
}

export async function batchImportWikiDocuments(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = batchImportSchema.safeParse({
    spaceId: formData.get("spaceId") || undefined,
    parentId: formData.get("parentId") || undefined,
  });

  if (!parsed.success) {
    throw new Error("请选择有效的导入位置。");
  }

  const rawFile = formData.get("batchFile");
  if (!(rawFile instanceof File) || rawFile.size <= 0) {
    throw new Error("请选择要批量导入的 ZIP 文件。");
  }

  const target = await resolveTarget(userId, parsed.data.spaceId, parsed.data.parentId);
  const archives = await parseBatchImportArchives(rawFile);
  const failedArchives: string[] = [];
  let createdCount = 0;

  for (const archive of archives) {
    const documentFormData = new FormData();
    documentFormData.set("type", "document");
    documentFormData.set("documentSource", "upload");
    documentFormData.set("spaceId", target.spaceId);
    if (target.parentId) {
      documentFormData.set("parentId", target.parentId);
    }
    documentFormData.set("sourceFile", archive.file);

    try {
      await createWikiItem(documentFormData);
      createdCount += 1;
    } catch {
      failedArchives.push(archive.archiveName);
    }
  }

  revalidatePath("/notes");
  return {
    totalCount: archives.length,
    createdCount,
    failedCount: failedArchives.length,
    failedArchives,
  };
}

export async function deleteDirectory(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = deleteDirectorySchema.safeParse({
    directoryId: formData.get("directoryId"),
  });

  if (!parsed.success) {
    throw new Error("请选择要删除的目录。");
  }

  const directory = await requireWritableDirectory(userId, parsed.data.directoryId);
  const ids = await collectDescendantNoteIds(directory.id);
  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.note.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt },
    }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "directory.deleted",
        targetType: "note",
        targetId: directory.id,
        metadata: { title: directory.title, affectedNoteCount: ids.length },
      },
    }),
  ]);

  revalidatePath("/notes");
}

export async function deleteWikiDocument(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = deleteDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
  });

  if (!parsed.success) {
    throw new Error("请选择要删除的文档。");
  }

  const document = await requireWritableDocument(userId, parsed.data.documentId);
  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.note.update({
      where: { id: document.id },
      data: { deletedAt },
    }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "note.deleted",
        targetType: "note",
        targetId: document.id,
        metadata: {
          title: document.title,
          parentId: document.parentId,
          spaceId: document.spaceId,
        },
      },
    }),
  ]);

  revalidatePath("/notes");
  revalidatePath(`/notes/${document.id}`);
}

export async function restoreTrashNote(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = trashNoteSchema.safeParse({
    noteId: formData.get("noteId"),
  });

  if (!parsed.success) {
    throw new Error("请选择要恢复的项目。");
  }

  const note = await requireTrashNote(userId, parsed.data.noteId);
  const isDirectory = note.contentFormat === "directory";
  const ids = isDirectory ? await collectDescendantNoteIds(note.id, true) : [note.id];
  let nextParentId = note.parentId;

  if (nextParentId) {
    const parent = await prisma.note.findFirst({
      where: { id: nextParentId, deletedAt: null, contentFormat: "directory" },
      select: { id: true },
    });

    if (!parent) {
      nextParentId = null;
    }
  }

  await prisma.$transaction([
    prisma.note.update({
      where: { id: note.id },
      data: {
        deletedAt: null,
        parentId: nextParentId,
      },
    }),
    ...(isDirectory
      ? [
          prisma.note.updateMany({
            where: { id: { in: ids.filter((id) => id !== note.id) } },
            data: { deletedAt: null },
          }),
        ]
      : []),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "note.restored",
        targetType: "note",
        targetId: note.id,
        metadata: {
          title: note.title,
          restoredNoteCount: ids.length,
          parentResetToRoot: note.parentId !== nextParentId,
        },
      },
    }),
  ]);

  revalidatePath("/notes");
  revalidatePath("/notes/trash");
  revalidatePath(`/notes/${note.id}`);
}

export async function permanentlyDeleteTrashNote(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = trashNoteSchema.safeParse({
    noteId: formData.get("noteId"),
  });

  if (!parsed.success) {
    throw new Error("请选择要彻底删除的项目。");
  }

  const result = await hardDeleteNoteTree(userId, parsed.data.noteId);

  revalidatePath("/notes");
  revalidatePath("/notes/trash");
  revalidatePath(`/notes/${result.noteId}`);
}

export async function purgeExpiredTrashNotes(userId?: string) {
  const currentUserId = userId ?? (await getCurrentUserId());
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const expiredNotes = await prisma.note.findMany({
    where: {
      deletedAt: { lt: cutoff },
      space: {
        deletedAt: null,
        OR: [
          { ownerId: currentUserId },
          { members: { some: { userId: currentUserId, role: { in: [SpaceRole.OWNER, SpaceRole.ADMIN, SpaceRole.EDITOR] } } } },
        ],
      },
    },
    orderBy: { deletedAt: "asc" },
    select: { id: true, parentId: true },
  });

  const expiredIdSet = new Set(expiredNotes.map((note) => note.id));
  const roots = expiredNotes.filter((note) => !note.parentId || !expiredIdSet.has(note.parentId));
  const handled = new Set<string>();

  for (const root of roots) {
    if (handled.has(root.id)) continue;
    const result = await hardDeleteNoteTree(currentUserId, root.id, "note.auto_purged_after_30_days");
    handled.add(result.noteId);
  }

  if (roots.length > 0) {
    revalidatePath("/notes/trash");
    revalidatePath("/notes");
  }
}

export async function moveDirectory(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = moveDirectorySchema.safeParse({
    directoryId: formData.get("directoryId"),
    targetKind: formData.get("targetKind"),
    targetId: formData.get("targetId"),
  });

  if (!parsed.success) {
    throw new Error("拖拽目标无效。");
  }

  const directory = await requireWritableDirectory(userId, parsed.data.directoryId);
  let nextSpaceId: string;
  let nextParentId: string | null;

  if (parsed.data.targetKind === "space") {
    nextSpaceId = parsed.data.targetId;
    nextParentId = null;

    if (!(await canWriteSpace(userId, nextSpaceId))) {
      throw new Error("目标空间不存在或没有权限。");
    }
  } else {
    if (parsed.data.targetId === directory.id) {
      throw new Error("不能把目录移动到自身下。");
    }

    const target = await requireWritableDirectory(userId, parsed.data.targetId);
    nextSpaceId = target.spaceId;
    nextParentId = target.id;

    let ancestorId: string | null = target.id;
    const visited = new Set<string>();

    while (ancestorId) {
      if (ancestorId === directory.id) {
        throw new Error("不能把目录移动到自己的子目录下。");
      }

      if (visited.has(ancestorId)) break;
      visited.add(ancestorId);

      const ancestor: { parentId: string | null } | null = await prisma.note.findFirst({
        where: { id: ancestorId, deletedAt: null },
        select: { parentId: true },
      });

      ancestorId = ancestor?.parentId ?? null;
    }
  }

  if (directory.parentId === nextParentId && directory.spaceId === nextSpaceId) {
    return;
  }

  const subtreeIds = await collectDescendantNoteIds(directory.id);

  await prisma.$transaction([
    prisma.note.update({
      where: { id: directory.id },
      data: { parentId: nextParentId, spaceId: nextSpaceId },
    }),
    prisma.note.updateMany({
      where: { id: { in: subtreeIds.filter((id) => id !== directory.id) } },
      data: { spaceId: nextSpaceId },
    }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "directory.moved",
        targetType: "note",
        targetId: directory.id,
        metadata: {
          fromSpaceId: directory.spaceId,
          fromParentId: directory.parentId,
          toSpaceId: nextSpaceId,
          toParentId: nextParentId,
        },
      },
    }),
  ]);

  revalidatePath("/notes");
}

export async function moveWikiDocument(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = moveDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
    targetKind: formData.get("targetKind"),
    targetId: formData.get("targetId"),
  });

  if (!parsed.success) {
    throw new Error("拖拽目标无效。");
  }

  const document = await requireWritableDocument(userId, parsed.data.documentId);
  let nextSpaceId: string;
  let nextParentId: string | null;

  if (parsed.data.targetKind === "space") {
    nextSpaceId = parsed.data.targetId;
    nextParentId = null;

    if (!(await canWriteSpace(userId, nextSpaceId))) {
      throw new Error("目标空间不存在或没有权限。");
    }
  } else {
    const target = await requireWritableDirectory(userId, parsed.data.targetId);
    nextSpaceId = target.spaceId;
    nextParentId = target.id;
  }

  if (document.parentId === nextParentId && document.spaceId === nextSpaceId) {
    return;
  }

  await prisma.$transaction([
    prisma.note.update({
      where: { id: document.id },
      data: {
        parentId: nextParentId,
        spaceId: nextSpaceId,
      },
    }),
    prisma.attachment.updateMany({
      where: { noteId: document.id },
      data: { spaceId: nextSpaceId },
    }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "note.moved",
        targetType: "note",
        targetId: document.id,
        metadata: {
          title: document.title,
          fromSpaceId: document.spaceId,
          fromParentId: document.parentId,
          toSpaceId: nextSpaceId,
          toParentId: nextParentId,
        },
      },
    }),
  ]);

  revalidatePath("/notes");
  revalidatePath(`/notes/${document.id}`);
}

export async function updateWikiDocument(formData: FormData) {
  const userId = await getCurrentUserId();
  const parsed = updateDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
    title: formData.get("title"),
    content: formData.get("content") ?? "",
  });

  if (!parsed.success) {
    throw new Error("请输入有效的文档标题和内容。");
  }

  const document = await requireWritableDocument(userId, parsed.data.documentId);

  await prisma.$transaction([
    prisma.note.update({
      where: { id: document.id },
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
      },
    }),
    prisma.noteRevision.create({
      data: {
        noteId: document.id,
        editorId: userId,
        title: parsed.data.title,
        content: parsed.data.content,
        changeSummary: "编辑文档",
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "note.updated",
        targetType: "note",
        targetId: document.id,
        metadata: {
          previousTitle: document.title,
          parentId: document.parentId,
          spaceId: document.spaceId,
        },
      },
    }),
  ]);

  revalidatePath("/notes");
  revalidatePath(`/notes/${document.id}`);
}
