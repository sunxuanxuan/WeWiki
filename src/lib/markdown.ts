export const supportedMarkdownBlocks = [
  "gfm",
  "mermaid",
  "markmap",
] as const;

export const markdownSecurityNotes = [
  "Render user Markdown with rehype-sanitize.",
  "Serve uploaded files through authenticated API routes instead of public static URLs.",
  "Avoid enabling raw HTML until a strict sanitize schema is in place.",
] as const;

export type MarkdownHeading = {
  id: string;
  level: number;
  line: number;
  title: string;
};

const customBlockTagPattern = /<\/?(?:grid|column|callout)(?:\s+[^>]*)?>/gi;
const inlineStyleTagPattern = /<\/?(?:font|span)(?:\s+[^>]*)?>/gi;
const htmlCommentPattern = /<!--[\s\S]*?-->/g;
const lineBreakTagPattern = /<br\s*\/?>/gi;
const tableLineBreakPlaceholder = "__WEWIKI_TABLE_BR__";
const markdownHeadingPattern = /^(?: {0,3})(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const inlineCodeOrAdjacentStrongPattern =
  /(`+)(.*?)\1|(\*\*[^*\n]*[\p{P}\p{S}]\*\*)(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(\*\*(?=[\p{P}\p{S}]))/gu;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function getHtmlAttribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match?.[1] ? decodeHtmlEntities(match[1]).trim() : "";
}

function escapeMarkdownLinkLabel(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function convertCitesToMarkdown(content: string) {
  const documentRouteByFileType: Record<string, string> = {
    doc: "docs",
    docx: "docx",
    mindnote: "mindnotes",
    sheets: "sheets",
    wiki: "wiki",
  };

  return content.replace(/<cite\b([^>]*)>(?:<\/cite>)?/gi, (_match, attributes: string) => {
    const title = getHtmlAttribute(attributes, "title") || getHtmlAttribute(attributes, "user-name");
    const docId = getHtmlAttribute(attributes, "doc-id");
    const fileType = getHtmlAttribute(attributes, "file-type").toLowerCase();
    const route = documentRouteByFileType[fileType];
    const label = title || docId;

    if (!label) return "";
    if (!route || !/^[a-zA-Z0-9_-]+$/.test(docId)) return label;

    return `[${escapeMarkdownLinkLabel(label)}](https://bytedance.larkoffice.com/${route}/${docId})`;
  });
}

function convertCalloutInlineHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<latex\b[^>]*>([\s\S]*?)<\/latex>/gi, (_match, formula: string) => `$${formula.trim()}$`)
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) => {
        const label = text.replace(/<[^>]+>/g, "").trim() || href;
        return `[${label}](${href})`;
      })
      .replace(/<\/?(?:b|strong)(?:\s+[^>]*)?>/gi, "**")
      .replace(/<\/?(?:i|em)(?:\s+[^>]*)?>/gi, "*")
      .replace(/<\/?del(?:\s+[^>]*)?>/gi, "~~")
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, code: string) => `\`${code.replaceAll("`", "\\`")}\``)
      .replace(lineBreakTagPattern, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function convertCalloutsToMarkdown(content: string) {
  return content.replace(/<callout\b([^>]*)>([\s\S]*?)<\/callout>/gi, (_match, attributes: string, body: string) => {
    const emojiMatch = attributes.match(/\bemoji=["']([^"']+)["']/i);
    const emoji = emojiMatch?.[1]?.trim();
    const markdown = convertCalloutInlineHtml(
      body
        .replace(/<p\b[^>]*>/gi, "")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<ul\b[^>]*>|<\/ul>/gi, "\n")
        .replace(/<ol\b[^>]*>|<\/ol>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/li>/gi, "\n"),
    )
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, lines) => line || (index > 0 && index < lines.length - 1))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!markdown) return "\n";

    const lines = markdown.split("\n");
    if (emoji) {
      const firstContentLine = lines.findIndex((line) => line.trim());
      if (firstContentLine >= 0) lines[firstContentLine] = `${emoji} ${lines[firstContentLine]}`;
    }

    return `\n\n${lines.map((line) => (line ? `> ${line}` : ">")).join("\n")}\n\n`;
  });
}

function normalizeTableCell(value: string) {
  return decodeHtmlEntities(
    convertCitesToMarkdown(value)
      .replace(/<latex\b[^>]*>([\s\S]*?)<\/latex>/gi, (_match, formula: string) => `$${formula.trim()}$`)
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) => {
        const label = text.replace(/<[^>]+>/g, "").trim() || href;
        return `[${label}](${href})`;
      })
      .replace(/<\/p>\s*<p[^>]*>/gi, `${tableLineBreakPlaceholder}${tableLineBreakPlaceholder}`)
      .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, "")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<\/li>/gi, tableLineBreakPlaceholder)
      .replace(lineBreakTagPattern, tableLineBreakPlaceholder)
      .replace(/<[^>]+>/g, "")
      .replace(/\|/g, "\\|")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n+/g, tableLineBreakPlaceholder)
      .trim(),
  );
}

function convertHtmlTablesToMarkdown(content: string) {
  return content.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (tableHtml) => {
    const rows = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
      .map((rowMatch) =>
        Array.from(rowMatch[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)).map((cellMatch) =>
          normalizeTableCell(cellMatch[2]),
        ),
      )
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return "";
    }

    const columnCount = Math.max(...rows.map((row) => row.length), 1);
    const paddedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
    const header = paddedRows[0].map((cell, index) => cell || `列 ${index + 1}`);
    const separator = Array.from({ length: columnCount }, () => "---");
    const body = paddedRows.slice(1).map((row) => `| ${row.join(" | ")} |`);

    return [
      "",
      `| ${header.join(" | ")} |`,
      `| ${separator.join(" | ")} |`,
      ...body,
      "",
    ].join("\n");
  });
}

function normalizeAdjacentStrongDelimiters(content: string) {
  let fence: { marker: string; length: number } | null = null;

  return content
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!fence) {
          fence = { marker, length: fenceMatch[1].length };
        } else if (marker === fence.marker && fenceMatch[1].length >= fence.length) {
          fence = null;
        }
        return line;
      }

      if (fence) return line;

      return line.replace(
        inlineCodeOrAdjacentStrongPattern,
        (
          match,
          inlineCodeDelimiter: string | undefined,
          _inlineCode: string | undefined,
          closingStrong: string | undefined,
          openingStrong: string | undefined,
        ) => {
          if (inlineCodeDelimiter) return match;
          return closingStrong ? `${closingStrong}&#8203;` : `&#8203;${openingStrong}`;
        },
      );
    })
    .join("\n");
}

export function prepareMarkdownForRender(content: string) {
  const normalized = convertCitesToMarkdown(convertCalloutsToMarkdown(convertHtmlTablesToMarkdown(content.replace(/\r\n?/g, "\n"))))
    .replace(htmlCommentPattern, "\n")
    .replace(customBlockTagPattern, "\n\n")
    .replace(inlineStyleTagPattern, "")
    .replace(lineBreakTagPattern, "\n");

  return normalizeAdjacentStrongDelimiters(normalized)
    .replaceAll(tableLineBreakPlaceholder, "<br/>")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getHeadingTitle(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .trim();
}

export function getMarkdownHeadings(content: string): MarkdownHeading[] {
  let fence: { marker: string; length: number } | null = null;

  return prepareMarkdownForRender(content)
    .split("\n")
    .flatMap((line, index) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!fence) {
          fence = { marker, length: fenceMatch[1].length };
        } else if (marker === fence.marker && fenceMatch[1].length >= fence.length) {
          fence = null;
        }
        return [];
      }

      if (fence) return [];

      const match = line.match(markdownHeadingPattern);
      if (!match) return [];

      const title = getHeadingTitle(match[2]);
      if (!title) return [];

      return [{
        id: `heading-${index + 1}`,
        level: match[1].length,
        line: index + 1,
        title,
      }];
    });
}

export function isDocumentAttachmentUrl(href?: string) {
  if (!href) return false;
  return /\.(xlsx|xls|csv|doc|docx|pdf|ppt|pptx)(?:$|[?#])/i.test(href);
}

export function getAttachmentLabel(href?: string, fallback = "附件") {
  if (!href) return fallback;

  const pathname = href.split("?")[0] ?? href;
  const segments = pathname.split("/");
  const lastSegment = segments[segments.length - 1];

  if (!lastSegment) return fallback;

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}
