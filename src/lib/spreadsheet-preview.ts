import { readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { uploadDir } from "@/lib/storage";

type SpreadsheetSource = {
  filePath: string;
  fileName: string;
};

function decodePathname(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

function normalizeHref(href: string) {
  try {
    return new URL(href, "http://localhost").pathname;
  } catch {
    return href;
  }
}

function escapeMarkdownCell(value: unknown) {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br/>")
    .replace(/\|/g, "\\|")
    .trim();
}

function buildMarkdownTable(rows: string[][], fileName: string, href: string) {
  const normalizedRows = rows
    .map((row) => row.map(escapeMarkdownCell))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (normalizedRows.length === 0) {
    return `\n[打开表格：${fileName}](${href})\n`;
  }

  const columnCount = Math.max(...normalizedRows.map((row) => row.length), 1);
  const paddedRows = normalizedRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );

  const header = paddedRows[0].map((cell, index) => cell || `列 ${index + 1}`);
  const body = paddedRows.slice(1);
  const separator = Array.from({ length: columnCount }, () => "---");

  const lines = [
    `> 表格来源： [${fileName}](${href})`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];

  return `\n${lines.join("\n")}\n`;
}

async function resolveSpreadsheetFile(href: string) {
  const normalizedHref = normalizeHref(href);
  const decodedPathname = decodePathname(normalizedHref);

  if (/\.(xlsx|xls|csv)$/i.test(decodedPathname)) {
    return {
      filePath: path.join(/* turbopackIgnore: true */ process.cwd(), "public", decodedPathname.replace(/^\//, "")),
      fileName: path.basename(decodedPathname),
    } satisfies SpreadsheetSource;
  }

  const assetMatch = decodedPathname.match(/^\/api\/notes\/([^/]+)\/assets\/([^/]+)$/);
  if (!assetMatch) {
    return null;
  }

  const [, noteId, attachmentId] = assetMatch;
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      noteId,
      deletedAt: null,
      mimeType: {
        in: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv",
        ],
      },
    },
    select: {
      storageKey: true,
      originalName: true,
    },
  });

  if (!attachment) {
    return null;
  }

  return {
    filePath: path.join(uploadDir, attachment.storageKey),
    fileName: attachment.originalName,
  } satisfies SpreadsheetSource;
}

async function readSpreadsheetRows(filePath: string) {
  const fileBuffer = await readFile(filePath);
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
    dense: true,
    cellText: true,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
}

export async function embedSpreadsheetTables(content: string) {
  const matches = [...content.matchAll(/!?\[[^\]]*\]\(([^)]+\.(?:xlsx|xls|csv)|\/api\/notes\/[^)]+\/assets\/[^)]+)\)/gi)];
  if (matches.length === 0) {
    return content;
  }

  let nextContent = content;
  const handled = new Map<string, string>();

  for (const match of matches) {
    const fullMatch = match[0];
    const href = match[1];
    if (!href) continue;

    let replacement = handled.get(href);

    if (!replacement) {
      const source = await resolveSpreadsheetFile(href);
      if (!source) continue;

      const rows = await readSpreadsheetRows(source.filePath);
      replacement = buildMarkdownTable(rows, source.fileName, href);
      handled.set(href, replacement);
    }

    nextContent = nextContent.replace(fullMatch, replacement);
  }

  return nextContent;
}
