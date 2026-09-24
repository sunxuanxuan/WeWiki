import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { createWikiItem } from "@/app/(wiki)/notes/actions";
import { authOptions } from "@/lib/auth";
import { MAX_BATCH_MULTIPART_REQUEST_SIZE } from "@/lib/import-limits";
import { parseBatchImportArchives } from "@/lib/imported-document";

export const runtime = "nodejs";

type BatchImportEvent =
  | { type: "start"; totalCount: number }
  | { type: "progress"; processedCount: number; totalCount: number; createdCount: number; failedCount: number; archiveName: string }
  | { type: "complete"; totalCount: number; createdCount: number; failedCount: number; failedArchives: string[] }
  | { type: "error"; message: string };

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BATCH_MULTIPART_REQUEST_SIZE) {
    return NextResponse.json({ message: "批量导入 ZIP 大小不能超过 500 MB。" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "无法读取上传文件，请确认文件大小和格式。" }, { status: 400 });
  }

  const rawFile = formData.get("batchFile");
  if (!(rawFile instanceof File) || rawFile.size <= 0) {
    return NextResponse.json({ message: "请选择要批量导入的 ZIP 文件。" }, { status: 400 });
  }

  const spaceId = String(formData.get("spaceId") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: BatchImportEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const archives = await parseBatchImportArchives(rawFile);
        const failedArchives: string[] = [];
        let createdCount = 0;
        send({ type: "start", totalCount: archives.length });

        for (const [index, archive] of archives.entries()) {
          const documentFormData = new FormData();
          documentFormData.set("type", "document");
          documentFormData.set("documentSource", "batch-upload");
          if (spaceId) documentFormData.set("spaceId", spaceId);
          if (parentId) documentFormData.set("parentId", parentId);
          documentFormData.set("sourceFile", archive.file);

          try {
            await createWikiItem(documentFormData);
            createdCount += 1;
          } catch {
            failedArchives.push(archive.archiveName);
          }

          send({
            type: "progress",
            processedCount: index + 1,
            totalCount: archives.length,
            createdCount,
            failedCount: failedArchives.length,
            archiveName: archive.archiveName,
          });
        }

        send({
          type: "complete",
          totalCount: archives.length,
          createdCount,
          failedCount: failedArchives.length,
          failedArchives,
        });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "批量导入失败，请稍后重试。" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
