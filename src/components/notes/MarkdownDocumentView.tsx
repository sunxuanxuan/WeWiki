"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { updateWikiDocument } from "@/app/(wiki)/notes/actions";
import {
  getAttachmentLabel,
  isDocumentAttachmentUrl,
  getMarkdownHeadings,
  type MarkdownHeading,
  prepareMarkdownForRender,
} from "@/lib/markdown";

export type ReadableDocument = {
  id: string;
  title: string;
  content: string;
  renderedContent?: string;
  directory: string;
  updatedAt: string;
  editor: string;
  canWrite: boolean;
};

type ToolbarAction =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 }
  | { type: "wrap"; before: string; after?: string; placeholder: string }
  | { type: "block"; markdown: string; cursorOffset?: number };

const toolbarGroups: Array<Array<{ label: string; title: string; action: ToolbarAction }>> = [
  [
    { label: "H1", title: "一级标题", action: { type: "heading", level: 1 } },
    { label: "H2", title: "二级标题", action: { type: "heading", level: 2 } },
    { label: "H3", title: "三级标题", action: { type: "heading", level: 3 } },
    { label: "H4", title: "四级标题", action: { type: "heading", level: 4 } },
    { label: "H5", title: "五级标题", action: { type: "heading", level: 5 } },
  ],
  [
    { label: "B", title: "加粗", action: { type: "wrap", before: "**", after: "**", placeholder: "加粗文本" } },
    { label: "I", title: "斜体", action: { type: "wrap", before: "*", after: "*", placeholder: "斜体文本" } },
    { label: "`", title: "行内代码", action: { type: "wrap", before: "`", after: "`", placeholder: "code" } },
  ],
  [
    { label: "∑", title: "行内公式", action: { type: "wrap", before: "$", after: "$", placeholder: "E = mc^2" } },
    { label: "公式块", title: "块级公式", action: { type: "block", markdown: "$$\nE = mc^2\n$$\n", cursorOffset: 3 } },
    { label: "• 列表", title: "无序列表", action: { type: "block", markdown: "- 列表项\n", cursorOffset: 3 } },
    { label: "链接", title: "链接", action: { type: "wrap", before: "[", after: "](https://example.com)", placeholder: "链接文本" } },
  ],
];

function ResizableTable({ children }: { children: ReactNode }) {
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    function initializeColumnWidths() {
      const firstRow = table?.rows[0];
      if (!table || !firstRow) return;

      const widths = Array.from(firstRow.cells).map((cell) => cell.getBoundingClientRect().width);
      for (const row of Array.from(table.rows)) {
        Array.from(row.cells).forEach((cell, index) => {
          const width = Math.max(widths[index] ?? cell.getBoundingClientRect().width, 120);
          cell.style.width = `${width}px`;
          cell.style.minWidth = `${width}px`;
          cell.style.maxWidth = `${width}px`;
        });
      }
      table.style.width = `${widths.reduce((sum, width) => sum + Math.max(width, 120), 0)}px`;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const handle = target.closest<HTMLElement>("[data-col-resize-handle]");
      if (!handle || !table) return;

      const cell = handle.closest<HTMLTableCellElement>("th,td");
      if (!cell) return;

      event.preventDefault();
      initializeColumnWidths();

      const columnIndex = cell.cellIndex;
      const startX = event.clientX;
      const startWidth = cell.getBoundingClientRect().width;

      function applyWidth(nextWidth: number) {
        if (!table) return;

        const width = Math.max(nextWidth, 120);
        for (const row of Array.from(table.rows)) {
          const targetCell = row.cells[columnIndex];
          if (!targetCell) continue;
          targetCell.style.width = `${width}px`;
          targetCell.style.minWidth = `${width}px`;
          targetCell.style.maxWidth = `${width}px`;
        }

        const firstRow = table.rows[0];
        if (firstRow) {
          const totalWidth = Array.from(firstRow.cells).reduce(
            (sum, currentCell) => sum + currentCell.getBoundingClientRect().width,
            0,
          );
          table.style.width = `${totalWidth}px`;
        }
      }

      function handlePointerMove(moveEvent: PointerEvent) {
        applyWidth(startWidth + moveEvent.clientX - startX);
      }

      function handlePointerUp() {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    }

    table.addEventListener("pointerdown", handlePointerDown);
    return () => table.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200">
      <table ref={tableRef} className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
        {children}
      </table>
    </div>
  );
}

function DocumentOutline({
  headings,
  compact = false,
}: {
  headings: MarkdownHeading[];
  compact?: boolean;
}) {
  const [activeHeadingId, setActiveHeadingId] = useState(headings[0]?.id);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleHeading = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)[0];

        if (visibleHeading) {
          setActiveHeadingId(visibleHeading.target.id);
        }
      },
      { rootMargin: "-12% 0px -76% 0px" },
    );

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings]);

  function scrollToHeading(event: React.MouseEvent<HTMLAnchorElement>, headingId: string) {
    event.preventDefault();
    document.getElementById(headingId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${headingId}`);
    setActiveHeadingId(headingId);
  }

  return (
    <nav aria-label="文档目录" className={compact ? "border-b border-slate-100 pb-5" : "sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-4"}>
      <p className="mb-3 text-xs font-semibold tracking-wide text-slate-400">文档目录</p>
      <ol className="space-y-1">
        {headings.map((heading) => {
          const isActive = activeHeadingId === heading.id;
          const indentation = Math.min((heading.level - 1) * 12, 48);

          return (
            <li key={heading.id} style={{ paddingLeft: `${indentation}px` }}>
              <a
                href={`#${heading.id}`}
                onClick={(event) => scrollToHeading(event, heading.id)}
                aria-current={isActive ? "location" : undefined}
                className={`block border-l-2 py-1 text-sm leading-5 transition ${
                  isActive
                    ? "border-blue-600 pl-3 font-medium text-blue-700"
                    : "border-transparent pl-3 text-slate-500 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {heading.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function MarkdownPreview({
  content,
  headings,
}: {
  content: string;
  headings?: MarkdownHeading[];
}) {
  const normalizedContent = useMemo(() => prepareMarkdownForRender(content), [content]);
  const headingsByLine = useMemo(
    () => new Map((headings ?? getMarkdownHeadings(content)).map((heading) => [heading.line, heading.id])),
    [content, headings],
  );

  if (!normalizedContent.trim()) {
    return <p className="text-slate-400">暂无内容。点击编辑开始编写 Markdown 文档。</p>;
  }

  const schemaAttributes = defaultSchema.attributes ?? {};
  const mathSanitizeSchema = {
    ...defaultSchema,
    attributes: {
      ...schemaAttributes,
      div: [
        ...((schemaAttributes.div as Array<string | [string, ...string[]]>) || []),
        ["className", "math", "math-display"],
      ],
      span: [
        ...((schemaAttributes.span as Array<string | [string, ...string[]]>) || []),
        ["className", "math", "math-inline"],
      ],
    },
  };

  return (
    <article className="space-y-4 text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, mathSanitizeSchema], rehypeKatex]}
        components={{
          h1: ({ children, node }) => <h1 id={headingsByLine.get(node?.position?.start.line ?? 0)} className="scroll-mt-6 border-b border-slate-100 pb-3 text-3xl font-bold text-slate-950">{children}</h1>,
          h2: ({ children, node }) => <h2 id={headingsByLine.get(node?.position?.start.line ?? 0)} className="scroll-mt-6 mt-8 text-2xl font-semibold text-slate-950">{children}</h2>,
          h3: ({ children, node }) => <h3 id={headingsByLine.get(node?.position?.start.line ?? 0)} className="scroll-mt-6 mt-6 text-xl font-semibold text-slate-950">{children}</h3>,
          h4: ({ children, node }) => <h4 id={headingsByLine.get(node?.position?.start.line ?? 0)} className="scroll-mt-6 mt-5 text-lg font-semibold text-slate-950">{children}</h4>,
          h5: ({ children, node }) => <h5 id={headingsByLine.get(node?.position?.start.line ?? 0)} className="scroll-mt-6 mt-4 text-base font-semibold text-slate-950">{children}</h5>,
          h6: ({ children, node }) => <h6 id={headingsByLine.get(node?.position?.start.line ?? 0)} className="scroll-mt-6 mt-4 text-sm font-semibold text-slate-950">{children}</h6>,
          p: ({ children }) => <p className="leading-7 text-slate-700">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-2 pl-6 text-slate-700">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-2 pl-6 text-slate-700">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-blue-200 bg-blue-50/60 py-2 pl-4 text-slate-600">{children}</blockquote>,
          code: ({ children }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-blue-700">{children}</code>,
          pre: ({ children }) => <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{children}</pre>,
          a: ({ children, href }) =>
            isDocumentAttachmentUrl(href) ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 no-underline"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-blue-600">📎</span>
                <span>{getAttachmentLabel(href, typeof children === "string" ? children : "附件")}</span>
              </a>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline underline-offset-4">{children}</a>
            ),
          img: ({ alt, src }) => <img alt={alt ?? ""} src={src} className="max-w-full rounded-xl border border-slate-200 shadow-sm" />,
          table: ({ children }) => <ResizableTable>{children}</ResizableTable>,
          th: ({ children }) => (
            <th className="relative border-r border-slate-100 bg-slate-50 p-0 text-left align-top font-semibold text-slate-700 last:border-r-0">
              <div className="min-h-10 min-w-32 overflow-auto px-3 py-2 whitespace-normal [overflow-wrap:anywhere]">
                {children}
              </div>
              <span
                data-col-resize-handle
                title="拖动调整整列宽度"
                className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none bg-transparent transition hover:bg-blue-300/50"
              />
            </th>
          ),
          td: ({ children }) => (
            <td className="border-r border-t border-slate-100 p-0 align-top text-slate-700 last:border-r-0">
              <div className="min-h-10 min-w-32 overflow-auto px-3 py-2 whitespace-normal [overflow-wrap:anywhere]">
                {children}
              </div>
            </td>
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </article>
  );
}

export function MarkdownDocumentView({
  document,
  initialEditing = false,
}: {
  document: ReadableDocument;
  initialEditing?: boolean;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(initialEditing && document.canWrite);
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewTitle = useMemo(() => title.trim() || "未命名文档", [title]);
  const previewContent = useMemo(() => {
    if (content === document.content && document.renderedContent) {
      return document.renderedContent;
    }

    return content;
  }, [content, document.content, document.renderedContent]);
  const documentHeadings = useMemo(() => getMarkdownHeadings(previewContent), [previewContent]);

  function focusEditor(selectionStart?: number, selectionEnd?: number) {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      if (selectionStart !== undefined && selectionEnd !== undefined) {
        textarea.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  }

  function replaceSelection(nextValue: string, selectionStart: number, selectionEnd: number) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const value = `${content.slice(0, start)}${nextValue}${content.slice(end)}`;

    setContent(value);
    focusEditor(start + selectionStart, start + selectionEnd);
  }

  function insertInline(before: string, after = before, placeholder = "文本") {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const selected = content.slice(start, end) || placeholder;
    replaceSelection(`${before}${selected}${after}`, before.length, before.length + selected.length);
  }

  function insertBlock(markdown: string, cursorOffset?: number) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const needsLeadingBreak = start > 0 && !content.slice(0, start).endsWith("\n");
    const text = `${needsLeadingBreak ? "\n" : ""}${markdown}`;
    const offset = cursorOffset ?? text.length;
    replaceSelection(text, offset, offset);
  }

  function applyHeading(level: 1 | 2 | 3 | 4 | 5) {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? content.length;
    const lineStart = content.lastIndexOf("\n", Math.max(cursor - 1, 0)) + 1;
    const lineEndIndex = content.indexOf("\n", cursor);
    const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
    const currentLine = content.slice(lineStart, lineEnd);
    const cleanLine = currentLine.replace(/^#{1,6}\s+/, "");
    const prefix = `${"#".repeat(level)} `;
    const nextLine = `${prefix}${cleanLine || "标题"}`;
    const nextContent = `${content.slice(0, lineStart)}${nextLine}${content.slice(lineEnd)}`;
    const nextCursor = lineStart + prefix.length + (cleanLine || "标题").length;

    setContent(nextContent);
    focusEditor(nextCursor, nextCursor);
  }

  function handleToolbarAction(action: ToolbarAction) {
    switch (action.type) {
      case "heading":
        applyHeading(action.level);
        break;
      case "wrap":
        insertInline(action.before, action.after, action.placeholder);
        break;
      case "block":
        insertBlock(action.markdown, action.cursorOffset);
        break;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await updateWikiDocument(formData);
        setMessage("已保存");
        router.refresh();
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "保存失败，请稍后重试。");
      }
    });
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] p-4 text-slate-900 sm:p-6">
      <section className="mx-auto min-h-[calc(100vh-3rem)] max-w-7xl rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <header className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <Link href="/notes" className="font-medium text-blue-600 hover:text-blue-500">← 返回首页</Link>
              <span>/</span>
              <span className="truncate">{document.directory}</span>
            </div>
            <h1 className="truncate text-2xl font-semibold text-slate-950">{previewTitle}</h1>
            <p className="mt-1 text-sm text-slate-500">最后更新：{document.updatedAt} · 更新者：{document.editor}</p>
          </div>

          <div className="flex items-center gap-3">
            {message ? <span className={`text-sm ${message === "已保存" ? "text-emerald-600" : "text-red-600"}`}>{message}</span> : null}
            {document.canWrite ? (
              isEditing ? (
                <button type="submit" form="document-edit-form" disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">
                  {isPending ? "保存中..." : "保存"}
                </button>
              ) : (
                <button type="button" onClick={() => setIsEditing(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                  编辑
                </button>
              )
            ) : null}
            {isEditing ? <button type="button" onClick={() => setIsEditing(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">退出编辑</button> : null}
          </div>
        </header>

        {isEditing ? (
          <form id="document-edit-form" onSubmit={handleSubmit} className="grid min-h-[calc(100vh-9rem)] lg:grid-cols-2">
            <input type="hidden" name="documentId" value={document.id} />
            <section className="overflow-auto border-b border-slate-100 p-6 lg:border-b-0 lg:border-r">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">实时预览</h2>
              <h1 className="mb-6 text-3xl font-bold text-slate-950">{previewTitle}</h1>
              <MarkdownPreview content={previewContent} />
            </section>
            <section className="flex min-h-[620px] flex-col bg-slate-50/50 p-6">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Markdown 源文件</h2>
              <label className="text-sm font-medium text-slate-700" htmlFor="title">标题</label>
              <input id="title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} className="mt-2 h-11 rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
              <div className="mt-5 flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-slate-700" htmlFor="content">正文</label>
                <span className="text-xs text-slate-400">选中文本后点击按钮可自动包裹语法</span>
              </div>
              <div className="mt-2 rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap gap-2 border-b border-slate-100 p-2">
                  {toolbarGroups.map((group, groupIndex) => (
                    <div key={groupIndex} className="flex flex-wrap gap-1 border-r border-slate-100 pr-2 last:border-r-0 last:pr-0">
                      {group.map((item) => (
                        <button
                          key={item.title}
                          type="button"
                          title={item.title}
                          onClick={() => handleToolbarAction(item.action)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-600"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  id="content"
                  name="content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="输入 Markdown 内容..."
                  className="min-h-[460px] w-full flex-1 resize-none rounded-b-xl bg-white p-4 font-mono text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
            </section>
          </form>
        ) : (
          <section className={`mx-auto px-6 py-10 ${documentHeadings.length > 0 ? "max-w-7xl" : "max-w-4xl"}`}>
            {documentHeadings.length > 0 ? (
              <div className="mb-7 lg:hidden">
                <DocumentOutline headings={documentHeadings} compact />
              </div>
            ) : null}
            <div className={documentHeadings.length > 0 ? "grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12" : ""}>
              {documentHeadings.length > 0 ? (
                <aside className="hidden lg:block">
                  <DocumentOutline headings={documentHeadings} />
                </aside>
              ) : null}
              <div className="min-w-0">
                <MarkdownPreview content={previewContent} headings={documentHeadings} />
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
