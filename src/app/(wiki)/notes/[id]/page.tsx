import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { MarkdownDocumentView } from "@/components/notes/MarkdownDocumentView";
import { authOptions } from "@/lib/auth";
import { canAccessNote } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { embedSpreadsheetTables } from "@/lib/spreadsheet-preview";

export const metadata = {
  title: "文档 - WeWiki",
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

async function getDirectoryPath(parentId: string | null, spaceName: string) {
  if (!parentId) return spaceName;

  const names: string[] = [];
  let currentId: string | null = parentId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const directory: { id: string; title: string; parentId: string | null } | null = await prisma.note.findFirst({
      where: { id: currentId, deletedAt: null, contentFormat: "directory" },
      select: { id: true, title: true, parentId: true },
    });

    if (!directory) break;
    names.unshift(directory.title);
    currentId = directory.parentId;
  }

  return names.length > 0 ? `${spaceName} / ${names.join(" / ")}` : spaceName;
}

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/notes");
  }

  const { id } = await params;
  const canRead = await canAccessNote({ userId: session.user.id, noteId: id, action: "read" });

  if (!canRead) {
    notFound();
  }

  const note = await prisma.note.findFirst({
    where: { id, deletedAt: null, NOT: { contentFormat: "directory" } },
    select: {
      id: true,
      title: true,
      content: true,
      parentId: true,
      updatedAt: true,
      owner: { select: { name: true, email: true } },
      space: { select: { name: true } },
    },
  });

  if (!note) {
    notFound();
  }

  const canWrite = await canAccessNote({ userId: session.user.id, noteId: id, action: "write" });
  const { edit } = await searchParams;
  const directory = await getDirectoryPath(note.parentId, note.space.name);
  const renderedContent = await embedSpreadsheetTables(note.content);

  return (
    <MarkdownDocumentView
      initialEditing={edit === "1"}
      document={{
        id: note.id,
        title: note.title,
        content: note.content,
        renderedContent,
        directory,
        updatedAt: formatDate(note.updatedAt),
        editor: note.owner.name ?? note.owner.email ?? "未知",
        canWrite,
      }}
    />
  );
}
