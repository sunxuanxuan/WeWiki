import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export const HOME_DOCUMENT_PAGE_SIZE = 50;

export type DocumentRow = {
  id: string;
  title: string;
  directory: string;
  spaceId: string;
  parentId: string | null;
  updatedAt: string;
  updatedAtMs: number;
  editor: string;
  color: "blue" | "amber" | "green" | "red" | "violet";
};

export type HomeDocumentPage = {
  documents: DocumentRow[];
  totalDocuments: number;
  nextCursor: string | null;
};

type DirectoryRow = {
  id: string;
  title: string;
  parentId: string | null;
  spaceId: string;
};

type DocumentCursor = {
  updatedAt: Date;
  id: string;
};

export type HomeDocumentScope = {
  spaceId: string;
  parentId: string | null;
};

export class InvalidDocumentCursorError extends Error {}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll("/", "-");
}

function buildAccessibleSpaceWhere(userId: string): Prisma.SpaceWhereInput {
  return {
    deletedAt: null,
    OR: [{ ownerId: userId }, { members: { some: { userId } } }],
  };
}

function buildDocumentWhere(userId: string, scope?: HomeDocumentScope, rawQuery?: string | null): Prisma.NoteWhereInput {
  const query = rawQuery?.trim();

  return {
    deletedAt: null,
    NOT: { contentFormat: "directory" },
    space: buildAccessibleSpaceWhere(userId),
    ...(scope ? { spaceId: scope.spaceId, parentId: scope.parentId } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { content: { contains: query, mode: "insensitive" } },
          ],
        } satisfies Prisma.NoteWhereInput
      : {}),
  };
}

function encodeCursor(cursor: DocumentCursor) {
  return Buffer.from(JSON.stringify([cursor.updatedAt.toISOString(), cursor.id])).toString("base64url");
}

function decodeCursor(rawCursor: string): DocumentCursor {
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") {
      throw new Error("Invalid cursor payload");
    }

    const updatedAt = new Date(parsed[0]);
    const id = parsed[1].trim();
    if (Number.isNaN(updatedAt.getTime()) || !id) {
      throw new Error("Invalid cursor values");
    }

    return { updatedAt, id };
  } catch {
    throw new InvalidDocumentCursorError("文档分页游标无效。");
  }
}

function getDirectoryPath(parentId: string | null, spaceName: string, directoryById: Map<string, DirectoryRow>) {
  if (!parentId) return spaceName;

  const names: string[] = [];
  let current = directoryById.get(parentId);
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.title);
    current = current.parentId ? directoryById.get(current.parentId) : undefined;
  }

  return names.length > 0 ? `${spaceName} / ${names.join(" / ")}` : spaceName;
}

export async function getHomeDocumentPage(
  userId: string,
  rawCursor?: string | null,
  scope?: HomeDocumentScope,
  query?: string | null,
): Promise<HomeDocumentPage> {
  const baseWhere = buildDocumentWhere(userId, scope, query);
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  const pageWhere: Prisma.NoteWhereInput = cursor
    ? {
        AND: [
          baseWhere,
          {
            OR: [
              { updatedAt: { lt: cursor.updatedAt } },
              { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
            ],
          },
        ],
      }
    : baseWhere;

  const [totalDocuments, pageWithLookahead, directories] = await Promise.all([
    prisma.note.count({ where: baseWhere }),
    prisma.note.findMany({
      where: pageWhere,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: HOME_DOCUMENT_PAGE_SIZE + 1,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        parentId: true,
        spaceId: true,
        owner: { select: { name: true, email: true } },
        space: { select: { name: true } },
      },
    }),
    prisma.note.findMany({
      where: {
        deletedAt: null,
        contentFormat: "directory",
        space: buildAccessibleSpaceWhere(userId),
      },
      select: { id: true, title: true, parentId: true, spaceId: true },
    }),
  ]);

  const hasMore = pageWithLookahead.length > HOME_DOCUMENT_PAGE_SIZE;
  const pageNotes = pageWithLookahead.slice(0, HOME_DOCUMENT_PAGE_SIZE);
  const directoryById = new Map(directories.map((directory) => [directory.id, directory]));
  const documents: DocumentRow[] = pageNotes.map((note) => ({
    id: note.id,
    title: note.title,
    directory: getDirectoryPath(note.parentId, note.space.name, directoryById),
    spaceId: note.spaceId,
    parentId: note.parentId,
    updatedAt: formatDate(note.updatedAt),
    updatedAtMs: note.updatedAt.getTime(),
    editor: note.owner.name ?? note.owner.email ?? "未知",
    color: "blue",
  }));
  const lastDocument = pageNotes.at(-1);

  return {
    documents,
    totalDocuments,
    nextCursor: hasMore && lastDocument
      ? encodeCursor({ updatedAt: lastDocument.updatedAt, id: lastDocument.id })
      : null,
  };
}
