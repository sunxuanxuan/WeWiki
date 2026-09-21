import { authenticateApiRequest } from "@/lib/api-auth";
import { apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { canAccessNote } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type DirectoryRow = {
  id: string;
  title: string;
  parentId: string | null;
};

function buildPath(spaceName: string, directories: DirectoryRow[]) {
  if (directories.length === 0) return spaceName;
  return `${spaceName} / ${directories.map((directory) => directory.title).join(" / ")}`;
}

async function getDirectoryChain(parentId: string | null) {
  if (!parentId) return [];

  const chain: DirectoryRow[] = [];
  let currentId: string | null = parentId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const directory: DirectoryRow | null = await prisma.note.findFirst({
      where: { id: currentId, contentFormat: "directory" },
      select: { id: true, title: true, parentId: true },
    });

    if (!directory) break;
    chain.unshift(directory);
    currentId = directory.parentId;
  }

  return chain;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  const auth = await authenticateApiRequest(request, "notes:read");
  if (!auth.ok) return auth.response;

  const { noteId } = await context.params;
  const canRead = await canAccessNote({ userId: auth.principal.userId, noteId, action: "read" });
  if (!canRead) {
    return apiError(404, "not_found", "笔记不存在或当前令牌无权读取。 ");
  }

  const url = new URL(request.url);
  const includeContent = ["1", "true", "yes"].includes((url.searchParams.get("includeContent") ?? "").toLowerCase());

  const note = await prisma.note.findFirst({
    where: { id: noteId, deletedAt: null },
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
  });

  if (!note) {
    return apiError(404, "not_found", "笔记不存在。 ");
  }

  const [canWrite, canDelete, directoryChain] = await Promise.all([
    canAccessNote({ userId: auth.principal.userId, noteId, action: "write" }),
    canAccessNote({ userId: auth.principal.userId, noteId, action: "delete" }),
    getDirectoryChain(note.parentId),
  ]);

  return Response.json({
    data: {
      id: note.id,
      type: note.contentFormat === "directory" ? "directory" : "document",
      title: note.title,
      contentFormat: note.contentFormat,
      status: note.status,
      visibility: note.visibility,
      space: note.space,
      parentId: note.parentId,
      path: buildPath(note.space.name, directoryChain),
      owner: note.owner,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      ...(includeContent && note.contentFormat !== "directory" ? { markdown: note.content } : {}),
      permissions: {
        canRead: true,
        canWrite,
        canDelete,
      },
    },
  });
}
