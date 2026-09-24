import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SpaceRole } from "@/generated/prisma/enums";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getHomeDocumentPage } from "@/lib/wiki-home-documents";
import { WikiHome, type DirectoryNode } from "@/components/notes/WikiHome";

export const metadata = {
  title: "首页 - WeWiki",
};

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

  const [spaces, documentPage] = await Promise.all([
    prisma.space.findMany({
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
    }),
    getHomeDocumentPage(userId),
  ]);

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

  const initialDirectoryPage = spaces[0]
    ? await getHomeDocumentPage(userId, null, { spaceId: spaces[0].id, parentId: null })
    : { documents: [], totalDocuments: 0, nextCursor: null };
  const dataVersion = [
    documentPage.totalDocuments,
    ...documentPage.documents.map((document) => `${document.id}:${document.directory}:${document.updatedAtMs}`),
    ...spaces.flatMap((space) => [
      `${space.id}:${space.name}`,
      ...space.notes.map((note) => `${note.id}:${note.title}:${note.parentId ?? "root"}`),
    ]),
  ].join("|");

  return { directories, documents: documentPage.documents, initialDirectoryPage, dataVersion };
}

export default async function NotesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/notes");
  }

  const userName = session.user.name ?? session.user.email ?? "用户";
  const { directories, documents, initialDirectoryPage, dataVersion } = await getHomeData(session.user.id);

  return (
    <WikiHome
      userName={userName}
      directories={directories}
      documents={documents}
      initialDirectoryPage={initialDirectoryPage}
      dataVersion={dataVersion}
    />
  );
}
