import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { purgeExpiredTrashNotes } from "@/app/(wiki)/notes/actions";
import { TrashView, type TrashRow } from "@/components/notes/TrashView";

export const metadata = {
  title: "回收站 - WeWiki",
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

function getDaysLeft(deletedAt: Date) {
  const expiresAt = deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

async function getTrashItems(userId: string) {
  await purgeExpiredTrashNotes(userId);

  const notes = await prisma.note.findMany({
    where: {
      deletedAt: { not: null },
      space: {
        deletedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      title: true,
      contentFormat: true,
      parentId: true,
      deletedAt: true,
      space: { select: { name: true } },
    },
  });

  const directoryIds = Array.from(new Set(notes.map((note) => note.parentId).filter(Boolean) as string[]));
  const directories = directoryIds.length
    ? await prisma.note.findMany({
        where: { id: { in: directoryIds } },
        select: { id: true, title: true },
      })
    : [];
  const directoryNameById = new Map(directories.map((directory) => [directory.id, directory.title]));

  return notes.map<TrashRow>((note) => ({
    id: note.id,
    title: note.title,
    type: note.contentFormat === "directory" ? "directory" : "document",
    directory: note.parentId ? `${note.space.name} / ${directoryNameById.get(note.parentId) ?? "原目录已删除"}` : note.space.name,
    deletedAt: note.deletedAt ? formatDate(note.deletedAt) : "-",
    daysLeft: note.deletedAt ? getDaysLeft(note.deletedAt) : 30,
  }));
}

export default async function TrashPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/notes/trash");
  }

  const userName = session.user.name ?? session.user.email ?? "用户";
  const items = await getTrashItems(session.user.id);

  return <TrashView userName={userName} items={items} />;
}
