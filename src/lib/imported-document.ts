import JSZip, { type JSZipObject } from "jszip";
import path from "node:path";
import sharp from "sharp";
import {
  MAX_BATCH_DOCUMENT_EXTRACTED_SIZE,
  MAX_BATCH_IMPORT_FILE_SIZE,
  MAX_BATCH_NESTED_ARCHIVE_SIZE,
  MAX_SINGLE_IMPORT_EXTRACTED_SIZE,
  MAX_SINGLE_IMPORT_FILE_SIZE,
} from "@/lib/import-limits";

const MAX_ARCHIVE_FILE_COUNT = 500;
const MAX_BATCH_DOCUMENT_COUNT = 50;
const IMAGE_TRIM_AREA_THRESHOLD = 0.88;
const IMAGE_TRIM_PADDING = 24;

const documentLikeExtensions = new Set([
  ".xlsx",
  ".xls",
  ".csv",
  ".doc",
  ".docx",
  ".pdf",
  ".ppt",
  ".pptx",
]);

const trimmableImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImportedAsset = {
  originalName: string;
  relativePath: string;
  buffer: Buffer;
  mimeType: string;
  fileExt: string | null;
  fileSize: number;
  renderAsLink: boolean;
};

export type ImportedDocumentPayload = {
  title: string;
  content: string;
  source: "blank" | "markdown" | "zip";
  sourceFileName?: string;
  assets: ImportedAsset[];
};

export type BatchImportArchive = {
  archiveName: string;
  file: File;
};

type ParsedZipPayload = {
  title: string;
  content: string;
  assets: ImportedAsset[];
};

type JSZipObjectWithSizes = JSZipObject & {
  _data?: {
    uncompressedSize?: number;
  };
};

function getExtension(fileName: string) {
  return path.extname(fileName).toLowerCase();
}

function normalizeAssetReference(rawValue: string) {
  const cleaned = rawValue.trim().replace(/^\.?\//, "");
  const match = cleaned.match(/^assets?\/(.+)$/i);

  return match?.[1]?.replaceAll("\\", "/") ?? null;
}

function buildAssetUrl(noteId: string, attachmentId: string) {
  return `/api/notes/${noteId}/assets/${attachmentId}`;
}

function getMimeType(fileName: string) {
  const ext = getExtension(fileName);

  switch (ext) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".csv":
      return "text/csv";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

function normalizeArchivePath(rawPath: string) {
  const normalized = rawPath.replaceAll("\\", "/").replace(/^\.\/+/, "");

  if (normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) {
    throw new Error("压缩包包含非法绝对路径。");
  }

  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (segments.includes("..")) {
    throw new Error("压缩包包含非法路径。");
  }

  return segments.join("/");
}

function getAssetRelativePath(fileName: string, markdownFileName: string) {
  const fileSegments = normalizeArchivePath(fileName).split("/");
  const markdownDirectory = path.posix.dirname(normalizeArchivePath(markdownFileName));
  const directorySegments = markdownDirectory === "." ? [] : markdownDirectory.split("/");

  if (!directorySegments.every((segment, index) => fileSegments[index] === segment)) {
    return null;
  }

  const relativeSegments = fileSegments.slice(directorySegments.length);
  if (!["asset", "assets"].includes(relativeSegments[0]?.toLowerCase())) {
    return null;
  }

  return relativeSegments.slice(1).join("/") || null;
}

async function extractZipEntry(
  entry: JSZipObject,
  extractedSize: { value: number },
  maximumExtractedSize = MAX_SINGLE_IMPORT_EXTRACTED_SIZE,
) {
  const buffer = await entry.async("nodebuffer");
  extractedSize.value += buffer.byteLength;

  if (extractedSize.value > maximumExtractedSize) {
    throw new Error(`压缩包解压后的文件总大小不能超过 ${maximumExtractedSize / 1024 / 1024} MB。`);
  }

  return buffer;
}

async function trimExcessWhiteImageMargin(buffer: Buffer, mimeType: string) {
  if (!trimmableImageMimeTypes.has(mimeType)) return buffer;

  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return buffer;

    const trimmed = await sharp(buffer)
      .rotate()
      .trim({ background: "#ffffff", threshold: 10 })
      .toBuffer({ resolveWithObject: true });
    const retainedArea = (trimmed.info.width * trimmed.info.height) / (metadata.width * metadata.height);

    if (retainedArea > IMAGE_TRIM_AREA_THRESHOLD) return buffer;

    return sharp(trimmed.data)
      .extend({
        top: IMAGE_TRIM_PADDING,
        right: IMAGE_TRIM_PADDING,
        bottom: IMAGE_TRIM_PADDING,
        left: IMAGE_TRIM_PADDING,
        background: "#ffffff",
      })
      .toBuffer();
  } catch {
    return buffer;
  }
}

async function parseZipPayload(
  buffer: Buffer,
  maximumExtractedSize = MAX_SINGLE_IMPORT_EXTRACTED_SIZE,
): Promise<ParsedZipPayload> {
  let archive: JSZip;

  try {
    archive = await JSZip.loadAsync(buffer, {
      decodeFileName: (bytes) => new TextDecoder("gbk").decode(bytes as Uint8Array),
    });
  } catch {
    throw new Error("无法解析压缩包，请确认文件是有效的 ZIP。");
  }

  const entries = Object.values(archive.files).filter((entry) => {
    if (entry.dir) return false;

    const originalName = entry.unsafeOriginalName ?? entry.name;
    const normalizedName = normalizeArchivePath(originalName);
    return normalizedName && !normalizedName.startsWith("__MACOSX/");
  });

  if (entries.length > MAX_ARCHIVE_FILE_COUNT) {
    throw new Error(`压缩包内文件数量不能超过 ${MAX_ARCHIVE_FILE_COUNT} 个。`);
  }

  const declaredExtractedSize = entries.reduce(
    (total, entry) => total + ((entry as JSZipObjectWithSizes)._data?.uncompressedSize ?? 0),
    0,
  );
  if (declaredExtractedSize > maximumExtractedSize) {
    throw new Error(`压缩包解压后的文件总大小不能超过 ${maximumExtractedSize / 1024 / 1024} MB。`);
  }

  const markdownEntries = entries.filter((entry) => getExtension(entry.name) === ".md");
  if (markdownEntries.length !== 1) {
    throw new Error("压缩包中必须且只能包含一个 .md 文档。");
  }

  const markdownEntry = markdownEntries[0];
  const extractedSize = { value: 0 };
  const markdownBuffer = await extractZipEntry(markdownEntry, extractedSize, maximumExtractedSize);
  const assets: ImportedAsset[] = [];

  for (const entry of entries) {
    if (entry === markdownEntry) continue;

    const relativePath = getAssetRelativePath(entry.name, markdownEntry.name);
    if (!relativePath) continue;

    const fileName = path.posix.basename(relativePath);
    const mimeType = getMimeType(fileName);
    const sourceBuffer = await extractZipEntry(entry, extractedSize, maximumExtractedSize);
    const fileBuffer = await trimExcessWhiteImageMargin(sourceBuffer, mimeType);

    assets.push({
      originalName: fileName,
      relativePath,
      buffer: fileBuffer,
      mimeType,
      fileExt: getExtension(fileName) || null,
      fileSize: fileBuffer.byteLength,
      renderAsLink: documentLikeExtensions.has(getExtension(fileName)),
    });
  }

  return {
    title: path.posix.basename(markdownEntry.name, getExtension(markdownEntry.name)),
    content: markdownBuffer.toString("utf8"),
    assets,
  };
}

export async function parseImportedDocument(
  file: File,
  limits: { maximumFileSize?: number; maximumExtractedSize?: number } = {},
) {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("请先选择要上传的文件。");
  }

  const maximumFileSize = limits.maximumFileSize ?? MAX_SINGLE_IMPORT_FILE_SIZE;
  const maximumExtractedSize = limits.maximumExtractedSize ?? MAX_SINGLE_IMPORT_EXTRACTED_SIZE;

  if (file.size > maximumFileSize) {
    throw new Error(`上传文件大小不能超过 ${maximumFileSize / 1024 / 1024} MB。`);
  }

  const extension = getExtension(file.name);

  if (extension === ".md") {
    const content = await file.text();
    return {
      title: file.name.replace(/\.md$/i, "") || "未命名文档",
      content,
      source: "markdown" as const,
      sourceFileName: file.name,
      assets: [],
    };
  }

  if (extension !== ".zip") {
    throw new Error("目前仅支持上传 .md 或 .zip 文件。");
  }

  const payload = await parseZipPayload(Buffer.from(await file.arrayBuffer()), maximumExtractedSize);

  return {
    title: payload.title || file.name.replace(/\.zip$/i, "") || "未命名文档",
    content: payload.content,
    source: "zip" as const,
    sourceFileName: file.name,
    assets: payload.assets,
  };
}

export async function parseBatchImportArchives(file: File): Promise<BatchImportArchive[]> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("请选择要批量导入的 ZIP 文件。");
  }

  if (file.size > MAX_BATCH_IMPORT_FILE_SIZE) {
    throw new Error("批量导入 ZIP 大小不能超过 500 MB。");
  }

  if (getExtension(file.name) !== ".zip") {
    throw new Error("批量导入仅支持 ZIP 文件。");
  }

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()), {
      decodeFileName: (bytes) => new TextDecoder("gbk").decode(bytes as Uint8Array),
    });
  } catch {
    throw new Error("无法解析批量导入 ZIP，请确认文件有效。");
  }

  const zipEntries = Object.values(archive.files)
    .filter((entry) => !entry.dir)
    .map((entry) => ({ entry, archiveName: normalizeArchivePath(entry.unsafeOriginalName ?? entry.name) }))
    .filter(({ archiveName }) => archiveName && !archiveName.startsWith("__MACOSX/") && getExtension(archiveName) === ".zip");

  if (zipEntries.length === 0) {
    throw new Error("批量导入 ZIP 中未找到文档 ZIP 文件。");
  }

  if (zipEntries.length > MAX_BATCH_DOCUMENT_COUNT) {
    throw new Error(`一次批量导入最多支持 ${MAX_BATCH_DOCUMENT_COUNT} 篇文档。`);
  }

  const declaredNestedArchiveSize = zipEntries.reduce(
    (total, { entry }) => total + ((entry as JSZipObjectWithSizes)._data?.uncompressedSize ?? 0),
    0,
  );
  if (declaredNestedArchiveSize > MAX_BATCH_NESTED_ARCHIVE_SIZE) {
    throw new Error("批量导入 ZIP 中的文档压缩包总大小不能超过 500 MB。");
  }

  const extractedSize = { value: 0 };
  let declaredDocumentExtractedSize = 0;
  const archives: BatchImportArchive[] = [];
  for (const { entry, archiveName } of zipEntries) {
    const buffer = await extractZipEntry(entry, extractedSize, MAX_BATCH_NESTED_ARCHIVE_SIZE);

    try {
      const documentArchive = await JSZip.loadAsync(buffer, {
        decodeFileName: (bytes) => new TextDecoder("gbk").decode(bytes as Uint8Array),
      });
      declaredDocumentExtractedSize += Object.values(documentArchive.files)
        .filter((documentEntry) => !documentEntry.dir)
        .reduce(
          (total, documentEntry) => total + ((documentEntry as JSZipObjectWithSizes)._data?.uncompressedSize ?? 0),
          0,
        );
    } catch {
      // Individual invalid document archives are reported by the batch action and skipped.
    }

    if (declaredDocumentExtractedSize > MAX_BATCH_DOCUMENT_EXTRACTED_SIZE) {
      throw new Error("批量导入文档解压后的总大小不能超过 500 MB。");
    }

    const bytes = new Uint8Array(buffer.byteLength);
    bytes.set(buffer);
    archives.push({
      archiveName,
      file: new File([bytes], path.posix.basename(archiveName), { type: "application/zip" }),
    });
  }

  return archives;
}

export function rewriteMarkdownAssetUrls(
  content: string,
  noteId: string,
  attachmentsByPath: Map<string, { id: string; renderAsLink: boolean; label: string }>,
) {
  const replaceMarkdownLink = (match: string, label: string, rawPath: string, imagePrefix: string) => {
    const relativePath = normalizeAssetReference(rawPath);
    if (!relativePath) return match;

    const asset = attachmentsByPath.get(relativePath);
    if (!asset) return match;

    const href = buildAssetUrl(noteId, asset.id);
    if (imagePrefix === "!" && asset.renderAsLink) {
      return `[${label || asset.label}](${href})`;
    }

    return `${imagePrefix}[${label}](${href})`;
  };

  return content
    .replace(/(!?)\[([^\]]*)\]\(((?:\.\/)?assets?\/[^)]+)\)/gi, (match, imagePrefix, label, rawPath) =>
      replaceMarkdownLink(match, label, rawPath, imagePrefix),
    )
    .replace(/\((?:\.\/)?assets?\/([^)]+)\)/gi, (match, rawRelativePath) => {
      const relativePath = normalizeAssetReference(`asset/${rawRelativePath}`);
      if (!relativePath) return match;

      const asset = attachmentsByPath.get(relativePath);
      if (!asset) return match;

      return `(${buildAssetUrl(noteId, asset.id)})`;
    });
}
