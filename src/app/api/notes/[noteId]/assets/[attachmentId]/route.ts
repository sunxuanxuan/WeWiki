import path from "node:path";
import { readFile } from "node:fs/promises";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessNote } from "@/lib/permissions";
import { uploadDir } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ noteId: string; attachmentId: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { noteId, attachmentId } = await context.params;
  const canRead = await canAccessNote({
    userId: session.user.id,
    noteId,
    action: "read",
  });

  if (!canRead) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      noteId,
      deletedAt: null,
    },
    select: {
      storageKey: true,
      mimeType: true,
      originalName: true,
    },
  });

  if (!attachment) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const fileBuffer = await readFile(path.join(uploadDir, attachment.storageKey));

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
