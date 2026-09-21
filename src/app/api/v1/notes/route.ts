import type { Prisma } from "@/generated/prisma/client";
import { GlobalRole } from "@/generated/prisma/enums";
import { authenticateApiRequest } from "@/lib/api-auth";
import { apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { canAccessNote } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

type DirectoryRow = {
  id: string;
  title: string;
  parentId: string | null;
  spaceId: string;
};

function parseBoolean(value: string | null) {
  if (value === null) return false;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function clampLimit(value: string | null) {
  const parsed = Number(value ?? 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

function parseOffset(value: string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

function formatDate(date: Date) {
  return date.toISOString();
}

function makeSnippet(content: string, query: string | null) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  if (!query) {
    return normalized.slice(0, 180);
  }

  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return normalized.slice(0, 180);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(normalized.length, index + query.length + 120);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

function buildPath(note: { parentId: string | null; space: { name: string } }, directoryById: Map<string, DirectoryRow>) {
  if (!note.parentId) return note.space.name;

  const names: string[] = [];
  let current = directoryById.get(note.parentId);
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.title);
    current = current.parentId ? directoryById.get(current.parentId) : undefined;
  }

  return names.length > 0 ? `${note.space.name} / ${names.join(" / ")}` : note.space.name;
}

function buildAccessWhere(userId: string, globalRole: GlobalRole): Prisma.NoteWhereInput {
  if (globalRole === GlobalRole.ADMIN || globalRole === GlobalRole.SUPER_ADMIN) {
    return {};
  }

  return {
    OR: [
      { ownerId: userId },
      { permissions: { some: { userId } } },
      { space: { ownerId: userId } },
      { space: { members: { some: { userId } } } },
    ],
  };
}

function buildTypeWhere(type: string | null): Prisma.NoteWhereInput {
  switch (type) {
    case "all":
      return {};
    case "directory":
      return { contentFormat: "directory" };
    case "document":
    default:
      return { NOT: { contentFormat: "directory" } };
  }
}

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "notes:read");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() || null;
  const spaceId = url.searchParams.get("spaceId")?.trim() || null;
  const parentId = url.searchParams.get("parentId")?.trim() || null;
  const type = url.searchParams.get("type")?.trim() || "document";
  const includeContent = parseBoolean(url.searchParams.get("includeContent"));
  const limit = clampLimit(url.searchParams.get("limit"));
  const offset = parseOffset(url.searchParams.get("offset"));

  if (!["document", "directory", "all"].includes(type)) {
    return apiError(400, "invalid_type", "type 只能是 document、directory 或 all。 ");
  }

  const where: Prisma.NoteWhereInput = {
    deletedAt: null,
    space: { deletedAt: null },
    AND: [
      buildAccessWhere(auth.principal.userId, auth.principal.globalRole),
      buildTypeWhere(type),
      ...(spaceId ? [{ spaceId }] : []),
      ...(parentId ? [{ parentId: parentId === "root" ? null : parentId }] : []),
      ...(query
        ? [
            {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { content: { contains: query, mode: "insensitive" } },
              ],
            } satisfies Prisma.NoteWhereInput,
          ]
        : []),
    ],
  };

  const [total, notes] = await Promise.all([
    prisma.note.count({ where }),
    prisma.note.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        title: true,
        content: true,
        contentFormat: true,
        status: true,
        visibility: true,
        spaceId: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        space: { select: { id: true, name: true } },
      },
    }),
  ]);

  const spaceIds = Array.from(new Set(notes.map((note) => note.spaceId)));
  const directories = spaceIds.length
    ? await prisma.note.findMany({
        where: { spaceId: { in: spaceIds }, contentFormat: "directory" },
        select: { id: true, title: true, parentId: true, spaceId: true },
      })
    : [];
  const directoryById = new Map(directories.map((directory) => [directory.id, directory]));

  const data = await Promise.all(
    notes.map(async (note) => {
      const [canWrite, canDelete] = await Promise.all([
        canAccessNote({ userId: auth.principal.userId, noteId: note.id, action: "write" }),
        canAccessNote({ userId: auth.principal.userId, noteId: note.id, action: "delete" }),
      ]);

      return {
        id: note.id,
        type: note.contentFormat === "directory" ? "directory" : "document",
        title: note.title,
        contentFormat: note.contentFormat,
        status: note.status,
        visibility: note.visibility,
        space: note.space,
        parentId: note.parentId,
        path: buildPath(note, directoryById),
        owner: note.owner,
        createdAt: formatDate(note.createdAt),
        updatedAt: formatDate(note.updatedAt),
        snippet: note.contentFormat === "directory" ? "" : makeSnippet(note.content, query),
        ...(includeContent && note.contentFormat !== "directory" ? { markdown: note.content } : {}),
        permissions: {
          canRead: true,
          canWrite,
          canDelete,
        },
      };
    }),
  );

  return Response.json({
    data,
    pagination: {
      limit,
      offset,
      total,
      nextOffset: offset + data.length < total ? offset + data.length : null,
    },
  });
}
