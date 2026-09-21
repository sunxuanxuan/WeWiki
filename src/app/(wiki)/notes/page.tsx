import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SpaceRole } from "@/generated/prisma/enums";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WikiHome, type DirectoryNode, type DocumentRow } from "@/components/notes/WikiHome";

export const metadata = {
  title: "首页 - WeWiki",
};

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

async function ensureDefaultSpace(userId: string) {
  const existing = await prisma.space.findFirst({
    where: {
      ownerId: userId,
      name: "默认空间",
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.space.create({
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
}

async function getHomeData(userId: string) {
  await ensureDefaultSpace(userId);

  const spaces = await prisma.space.findMany({
    where: {
      deletedAt: null,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      notes: {
        where: { deletedAt: null, contentFormat: "directory" },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true, title: true, parentId: true, spaceId: true },
      },
    },
  });

  const notes = await prisma.note.findMany({
    where: {
      deletedAt: null,
      NOT: { contentFormat: "directory" },
      space: {
        deletedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      content: true,
      updatedAt: true,
      parentId: true,
      spaceId: true,
      owner: { select: { name: true, email: true } },
      space: { select: { id: true, name: true } },
    },
  });

  const directoryById = new Map<string, { id: string; title: string; parentId: string | null; spaceId: string }>();
  for (const space of spaces) {
    for (const note of space.notes) {
      directoryById.set(note.id, note);
    }
  }

  function getDirectoryPath(parentId: string | null, spaceName: string) {
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

  const directories: DirectoryNode[] = spaces.map((space) => {
    const childrenByParent = new Map<string, DirectoryNode[]>();

    for (const note of space.notes) {
      const node: DirectoryNode = {
        id: note.id,
        name: note.title,
        kind: "directory",
        spaceId: note.spaceId,
        parentId: note.parentId,
        children: [],
      };
      const parentKey = note.parentId ?? `space:${space.id}`;
      const siblings = childrenByParent.get(parentKey) ?? [];
      siblings.push(node);
      childrenByParent.set(parentKey, siblings);
    }

    function attach(node: DirectoryNode): DirectoryNode {
      return {
        ...node,
        children: (childrenByParent.get(node.id) ?? []).map(attach),
      };
    }

    return {
      id: `space:${space.id}`,
      name: space.name,
      kind: "space",
      spaceId: space.id,
      parentId: null,
      children: (childrenByParent.get(`space:${space.id}`) ?? []).map(attach),
    };
  });

  const documents: DocumentRow[] = notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    directory: getDirectoryPath(note.parentId, note.space.name),
    spaceId: note.spaceId,
    parentId: note.parentId,
    updatedAt: formatDate(note.updatedAt),
    updatedAtMs: note.updatedAt.getTime(),
    editor: note.owner.name ?? note.owner.email ?? "未知",
    color: "blue",
  }));

  return { directories, documents };
}

export default async function NotesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/notes");
  }

  const userName = session.user.name ?? session.user.email ?? "用户";
  const { directories, documents } = await getHomeData(session.user.id);

  return <WikiHome userName={userName} directories={directories} documents={documents} />;
}
