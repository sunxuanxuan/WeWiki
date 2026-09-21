import path from "node:path";

export const uploadDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR ?? "uploads");

export const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
]);

export function detectFileKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "IMAGE" as const;
  if (mimeType === "application/pdf") return "PDF" as const;
  if (mimeType.includes("word") || mimeType.includes("excel") || mimeType.includes("powerpoint")) {
    return "DOCUMENT" as const;
  }
  return "OTHER" as const;
}
