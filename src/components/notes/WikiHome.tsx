"use client";

import { createWikiItem, deleteDirectory, deleteWikiDocument, moveDirectory, moveWikiDocument, renameDirectory } from "@/app/(wiki)/notes/actions";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { MAX_BATCH_IMPORT_FILE_SIZE } from "@/lib/import-limits";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, FormEvent, useMemo, useRef, useState, useTransition } from "react";

export type DocumentRow = {
  id: string;
  title: string;
  directory: string;
  spaceId: string;
  parentId: string | null;
  updatedAt: string;
  updatedAtMs: number;
  editor: string;
  color: "blue" | "amber" | "green" | "red" | "violet";
};

export type DirectoryNode = {
  id: string;
  name: string;
  kind: "space" | "directory";
  spaceId: string;
  parentId: string | null;
  children: DirectoryNode[];
};

export type WikiHomeProps = {
  userName: string;
  directories: DirectoryNode[];
  documents: DocumentRow[];
  initialDirectoryPage: HomeDocumentPage;
  dataVersion: string;
};

type HomeDocumentPage = {
  documents: DocumentRow[];
  totalDocuments: number;
  nextCursor: string | null;
};

type CreateMode = "directory" | "document";
type DocumentSource = "blank" | "upload" | "batch";
type SortKey = "title" | "updatedAt";
type SortDir = "asc" | "desc";
type CreateTarget = { mode: CreateMode; spaceId: string; parentId: string | null; parentName: string };
type RenameTarget = { id: string; name: string };
type MoveTarget = { targetKind: "space" | "directory"; targetId: string };
type SelectedDirectory = { key: string; name: string; kind: "space" | "directory"; spaceId: string; parentId: string | null };
type DraggingItem = { type: "directory" | "document"; id: string } | null;
type Feedback = { tone: "success" | "error"; message: string } | null;
type BatchImportResult = {
  totalCount: number;
  createdCount: number;
  failedCount: number;
  failedArchives: string[];
};
type BatchImportProgress = { processedCount: number; totalCount: number; archiveName?: string };
type BatchImportEvent =
  | ({ type: "start" } & Pick<BatchImportProgress, "totalCount">)
  | ({ type: "progress" } & BatchImportProgress)
  | ({ type: "complete" } & BatchImportResult)
  | { type: "error"; message: string };

function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: "home" | "doc" | "share" | "star" | "trash" | "search" | "bell" | "plus" | "folder" | "dots" | "chevron" | "settings" | "save";
  className?: string;
}) {
  switch (name) {
    case "home":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z" fill="currentColor" /></svg>;
    case "doc":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" /><path d="M14 3v5h5M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "share":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 12h8M13 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 5h5M5 19h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "star":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
    case "trash":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "search":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m20 20-4.2-4.2M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "bell":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9ZM10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "plus":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "folder":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.7" /></svg>;
    case "dots":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
    case "chevron":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "settings":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.7" /><path d="M19 12a7.1 7.1 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
    case "save":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h12l2 2v16H5V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M8 3v6h8V3M8 21v-7h8v7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
  }
}

function SidebarNavItem({ icon, label, active = false, onClick }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${active ? "bg-blue-50 font-medium text-blue-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
      <Icon name={icon} />
      {label}
    </button>
  );
}

function DocumentIcon({ color }: { color: DocumentRow["color"] }) {
  void color;
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-500 text-[10px] font-bold text-white">D</span>;
}

function DocumentTitle({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <span className="group/title relative min-w-0 flex-1">
      <span className="block truncate">{title}</span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-full z-30 mt-2 hidden max-w-sm whitespace-normal break-words rounded-lg bg-slate-900 px-3 py-2 text-left font-normal leading-5 text-white shadow-xl group-hover/title:block ${compact ? "text-xs" : "text-sm"}`}
      >
        {title}
      </span>
    </span>
  );
}

function SortButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${active ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
      {label}
      <span className="text-[10px]">{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function DirectoryTreeNode({
  node,
  depth,
  ancestorDirectoryIds = [],
  documents,
  selectedKey,
  draggingItem,
  isMutating,
  onSelectDirectory,
  onCreate,
  onRename,
  onDelete,
  onDeleteDocument,
  onDragStart,
  onDragEnd,
  expandedNodeKeys,
  onToggleNode,
  activeDropZoneKey,
  onDropZoneChange,
  onMoveDirectory,
  onMoveDocument,
  router,
}: {
  node: DirectoryNode;
  depth: number;
  ancestorDirectoryIds?: string[];
  documents: DocumentRow[];
  selectedKey: string;
  draggingItem: DraggingItem;
  isMutating: boolean;
  onSelectDirectory: (directory: SelectedDirectory) => void;
  onCreate: (target: CreateTarget) => void;
  onRename: (target: RenameTarget) => void;
  onDelete: (node: DirectoryNode) => void;
  onDeleteDocument: (document: DocumentRow) => void;
  onDragStart: (item: NonNullable<DraggingItem>) => void;
  onDragEnd: () => void;
  expandedNodeKeys: ReadonlySet<string>;
  onToggleNode: (key: string) => void;
  activeDropZoneKey: string | null;
  onDropZoneChange: (key: string | null) => void;
  onMoveDirectory: (directoryId: string, target: MoveTarget) => void;
  onMoveDocument: (documentId: string, target: MoveTarget) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const nodeKey = node.kind === "space" ? `space:${node.spaceId}` : node.id;
  const open = expandedNodeKeys.has(nodeKey);
  const directDocuments = documents.filter((document) =>
    node.kind === "space" ? document.spaceId === node.spaceId && document.parentId === null : document.parentId === node.id,
  );
  const hasChildren = node.children.length > 0 || directDocuments.length > 0;
  const isDirectory = node.kind === "directory";
  const isDragging = draggingItem?.type === "directory" && draggingItem.id === node.id;
  const isInvalidDirectoryTarget = draggingItem?.type === "directory"
    && (draggingItem.id === node.id || ancestorDirectoryIds.includes(draggingItem.id));
  const canDrop = draggingItem !== null && !isInvalidDirectoryTarget;
  const active = selectedKey === nodeKey;

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    if (!isDirectory) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
    event.dataTransfer.setData("application/x-wewiki-item", JSON.stringify({ type: "directory", id: node.id }));
    onDragStart({ type: "directory", id: node.id });
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggingItem) return;
    event.stopPropagation();
    if (!canDrop) {
      onDropZoneChange(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (activeDropZoneKey !== nodeKey) onDropZoneChange(nodeKey);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!draggingItem) return;
    event.stopPropagation();
    if (!canDrop) return;
    event.preventDefault();
    onDropZoneChange(null);

    const rawItem = event.dataTransfer.getData("application/x-wewiki-item");
    const item = rawItem ? (JSON.parse(rawItem) as NonNullable<DraggingItem>) : draggingItem;
    if (!item) return;

    const target = { targetKind: node.kind, targetId: node.kind === "space" ? node.spaceId : node.id } satisfies MoveTarget;

    if (item.type === "directory") {
      if (item.id === node.id) return;
      onMoveDirectory(item.id, target);
    } else {
      onMoveDocument(item.id, target);
    }
  }

  function handleExpandedDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggingItem) return;
    event.stopPropagation();
    if (!canDrop) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (activeDropZoneKey !== nodeKey) onDropZoneChange(nodeKey);
  }

  function handleExpandedDragLeave(event: DragEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    if (activeDropZoneKey === nodeKey) onDropZoneChange(null);
  }

  return (
    <div>
      <div
        draggable={isDirectory && !isMutating}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`group flex items-center gap-1 rounded-lg pr-1 text-sm transition ${active ? "bg-blue-50" : canDrop ? "ring-1 ring-transparent hover:bg-blue-50 hover:ring-blue-100" : "hover:bg-slate-50"} ${isDragging ? "opacity-45" : ""}`}
        style={{ paddingLeft: `${Math.min(depth, 5) * 14}px` }}
        title={isDirectory ? "可拖动目录到其他目录或空间下，也可接收拖入的文档" : "可将目录或文档拖到空间根目录下"}
      >
        <button type="button" onClick={() => onToggleNode(nodeKey)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700">
          <span className={`block transition ${open ? "rotate-90" : ""} ${hasChildren ? "opacity-100" : "opacity-0"}`}><Icon name="chevron" className="h-3 w-3" /></span>
        </button>
        <button
          type="button"
          onClick={() => onSelectDirectory({ key: nodeKey, name: node.name, kind: node.kind, spaceId: node.spaceId, parentId: node.kind === "directory" ? node.id : null })}
          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left ${active ? "text-blue-700" : "text-slate-700"}`}
        >
          <Icon name="folder" className={`h-4 w-4 shrink-0 ${node.kind === "space" ? "text-blue-500" : "text-slate-400"}`} />
          <span className={`truncate ${node.kind === "space" ? "font-semibold" : "font-medium"}`}>{node.name}</span>
        </button>
        <button type="button" title="新建子目录" aria-label={`在 ${node.name} 下新建子目录`} onClick={() => onCreate({ mode: "directory", spaceId: node.spaceId, parentId: node.kind === "directory" ? node.id : null, parentName: node.name })} className="hidden rounded p-1 text-slate-400 hover:bg-white hover:text-blue-600 group-hover:inline-flex"><Icon name="plus" className="h-3.5 w-3.5" /></button>
        <button type="button" title="新建文档" aria-label={`在 ${node.name} 下新建文档`} onClick={() => onCreate({ mode: "document", spaceId: node.spaceId, parentId: node.kind === "directory" ? node.id : null, parentName: node.name })} className="hidden rounded p-1 text-slate-400 hover:bg-white hover:text-blue-600 group-hover:inline-flex"><Icon name="doc" className="h-3.5 w-3.5" /></button>
        {isDirectory ? <button type="button" title="重命名目录" aria-label={`重命名 ${node.name}`} disabled={isMutating} onClick={() => onRename({ id: node.id, name: node.name })} className="hidden rounded p-1 text-slate-400 hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 group-hover:inline-flex"><Icon name="dots" className="h-3.5 w-3.5" /></button> : null}
        {isDirectory ? <button type="button" title="删除目录" disabled={isMutating} onClick={() => onDelete(node)} className="hidden rounded p-1 text-slate-400 hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 group-hover:inline-flex"><Icon name="trash" className="h-3.5 w-3.5" /></button> : null}
      </div>

      {open && hasChildren ? (
        <div
          onDragOver={handleExpandedDragOver}
          onDragLeave={handleExpandedDragLeave}
          onDrop={handleDrop}
          className={`mt-1 min-h-4 space-y-1 rounded-lg border py-1 transition ${activeDropZoneKey === nodeKey && canDrop ? "border-blue-300 bg-blue-50/70 ring-2 ring-blue-100" : "border-transparent"}`}
        >
          {node.children.map((child) => (
            <DirectoryTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              ancestorDirectoryIds={node.kind === "directory" ? [...ancestorDirectoryIds, node.id] : ancestorDirectoryIds}
              documents={documents}
              selectedKey={selectedKey}
              draggingItem={draggingItem}
              isMutating={isMutating}
              onSelectDirectory={onSelectDirectory}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              onDeleteDocument={onDeleteDocument}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              expandedNodeKeys={expandedNodeKeys}
              onToggleNode={onToggleNode}
              activeDropZoneKey={activeDropZoneKey}
              onDropZoneChange={onDropZoneChange}
              onMoveDirectory={onMoveDirectory}
              onMoveDocument={onMoveDocument}
              router={router}
            />
          ))}
          {directDocuments.map((document) => (
            <div
              key={document.id}
              draggable={!isMutating}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", document.id);
                event.dataTransfer.setData("application/x-wewiki-item", JSON.stringify({ type: "document", id: document.id }));
                onDragStart({ type: "document", id: document.id });
              }}
              onDragEnd={onDragEnd}
              onDoubleClick={() => router.push(`/notes/${document.id}`)}
              className={`group/document ml-7 flex w-[calc(100%-1.75rem)] cursor-grab items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 active:cursor-grabbing ${draggingItem?.type === "document" && draggingItem.id === document.id ? "opacity-45" : ""}`}
              style={{ marginLeft: `${28 + Math.min(depth, 5) * 14}px` }}
              aria-label={`${document.title}；可拖动到其他目录，悬停可删除`}
            >
              <Icon name="doc" className="h-3.5 w-3.5 shrink-0" />
              <DocumentTitle title={document.title} compact />
              <button
                type="button"
                title="删除文档"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteDocument(document);
                }}
                className="hidden items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-red-500 hover:bg-red-50 group-hover/document:inline-flex"
              >
                <Icon name="trash" className="h-3 w-3" />
                删除
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DirectoryTree({
  directories,
  documents,
  selectedKey,
  draggingItem,
  isMutating,
  onSelectDirectory,
  onCreate,
  onRename,
  onDelete,
  onDeleteDocument,
  onDragStart,
  onDragEnd,
  expandedNodeKeys,
  onToggleNode,
  activeDropZoneKey,
  onDropZoneChange,
  onMoveDirectory,
  onMoveDocument,
  router,
}: {
  directories: DirectoryNode[];
  documents: DocumentRow[];
  selectedKey: string;
  draggingItem: DraggingItem;
  isMutating: boolean;
  onSelectDirectory: (directory: SelectedDirectory) => void;
  onCreate: (target: CreateTarget) => void;
  onRename: (target: RenameTarget) => void;
  onDelete: (node: DirectoryNode) => void;
  onDeleteDocument: (document: DocumentRow) => void;
  onDragStart: (item: NonNullable<DraggingItem>) => void;
  onDragEnd: () => void;
  expandedNodeKeys: ReadonlySet<string>;
  onToggleNode: (key: string) => void;
  activeDropZoneKey: string | null;
  onDropZoneChange: (key: string | null) => void;
  onMoveDirectory: (directoryId: string, target: MoveTarget) => void;
  onMoveDocument: (documentId: string, target: MoveTarget) => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-3 text-sm font-semibold text-slate-900">
        <span>目录</span>
        <button type="button" onClick={() => directories[0] && onCreate({ mode: "directory", spaceId: directories[0].spaceId, parentId: null, parentName: directories[0].name })} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Icon name="plus" /></button>
      </div>
      <div className="space-y-1">
        {directories.map((directory) => (
          <DirectoryTreeNode
            key={directory.id}
            node={directory}
            depth={0}
            documents={documents}
            selectedKey={selectedKey}
            draggingItem={draggingItem}
            isMutating={isMutating}
            onSelectDirectory={onSelectDirectory}
            onCreate={onCreate}
            onRename={onRename}
            onDelete={onDelete}
            onDeleteDocument={onDeleteDocument}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            expandedNodeKeys={expandedNodeKeys}
            onToggleNode={onToggleNode}
            activeDropZoneKey={activeDropZoneKey}
            onDropZoneChange={onDropZoneChange}
            onMoveDirectory={onMoveDirectory}
            onMoveDocument={onMoveDocument}
            router={router}
          />
        ))}
      </div>
    </div>
  );
}

function CreateModal({ target, onClose, onCreated }: { target: CreateTarget; onClose: () => void; onCreated: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [documentSource, setDocumentSource] = useState<DocumentSource>("blank");
  const [batchResult, setBatchResult] = useState<BatchImportResult | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchImportProgress | null>(null);
  const title = target.mode === "directory" ? "新建目录" : "新建文档";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);

    if (target.mode === "document") {
      const file = formData.get("sourceFile");
      const trimmedTitle = String(formData.get("title") ?? "").trim();

      if (documentSource === "blank" && !trimmedTitle) {
        setError("请输入文档标题。");
        return;
      }

      if (documentSource === "upload" && (!(file instanceof File) || file.size <= 0)) {
        setError("请选择一个 .md 或 .zip 文件。");
        return;
      }

      if (documentSource === "batch") {
        const batchFile = formData.get("batchFile");
        if (!(batchFile instanceof File) || batchFile.size <= 0) {
          setError("请选择包含文档 ZIP 的批量 ZIP 文件。");
          return;
        }
        if (batchFile.size > MAX_BATCH_IMPORT_FILE_SIZE) {
          setError("批量导入 ZIP 大小不能超过 500 MB。");
          return;
        }
      }
    }

    startTransition(async () => {
      try {
        if (documentSource === "batch") {
          setBatchProgress({ processedCount: 0, totalCount: 0 });
          const response = await fetch("/api/notes/batch-import", { method: "POST", body: formData });
          if (!response.ok) {
            const payload = await response.json().catch(() => null) as { message?: string } | null;
            throw new Error(payload?.message ?? "批量导入失败，请稍后重试。");
          }
          if (!response.body) throw new Error("浏览器不支持读取导入进度。");

          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          let result: BatchImportResult | null = null;
          while (true) {
            const { value, done } = await reader.read();
            buffer += value ?? "";
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line) continue;
              const event = JSON.parse(line) as BatchImportEvent;
              if (event.type === "start") setBatchProgress({ processedCount: 0, totalCount: event.totalCount });
              if (event.type === "progress") setBatchProgress({ processedCount: event.processedCount, totalCount: event.totalCount, archiveName: event.archiveName });
              if (event.type === "complete") result = event;
              if (event.type === "error") throw new Error(event.message);
            }
            if (done) break;
          }
          if (!result) throw new Error("批量导入未正常完成，请稍后重试。");
          form.reset();
          setBatchResult(result);
          setBatchProgress(null);
          onCreated();
          return;
        }

        await createWikiItem(formData);
        form.reset();
        setDocumentSource("blank");
        onClose();
        onCreated();
      } catch (caught) {
        setBatchProgress(null);
        setError(caught instanceof Error ? caught.message : "创建失败，请稍后重试。");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/15">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">创建位置：{target.parentName}</p></div>
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">✕</button>
        </div>
        <input type="hidden" name="type" value={target.mode} />
        <input type="hidden" name="spaceId" value={target.spaceId} />
        {target.mode === "document" ? <input type="hidden" name="documentSource" value={documentSource} /> : null}
        {target.parentId ? <input type="hidden" name="parentId" value={target.parentId} /> : null}
        {target.mode === "document" ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-slate-700">创建方式</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setDocumentSource("blank");
                  setBatchResult(null);
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${documentSource === "blank" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="font-semibold">从零开始</div>
                <div className="mt-1 text-xs text-slate-500">创建空白 Markdown 文档</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentSource("upload");
                  setBatchResult(null);
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${documentSource === "upload" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="font-semibold">上传文件</div>
                <div className="mt-1 text-xs text-slate-500">支持 .md 或包含 assets 的 .zip</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentSource("batch");
                  setBatchResult(null);
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${documentSource === "batch" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="font-semibold">批量上传</div>
                <div className="mt-1 text-xs text-slate-500">一个 ZIP 包含多篇文档 ZIP</div>
              </button>
            </div>
          </div>
        ) : null}
        {target.mode === "directory" || documentSource !== "batch" ? (
          <>
            <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="title">{target.mode === "directory" ? "目录名称" : documentSource === "upload" ? "文档标题（可选）" : "文档标题"}</label>
            <input id="title" name="title" autoFocus={documentSource === "blank" || target.mode === "directory"} required={target.mode === "directory" || (target.mode === "document" && documentSource === "blank")} maxLength={120} placeholder={target.mode === "directory" ? "例如：产品设计" : documentSource === "upload" ? "默认取上传文件名或 Markdown 标题" : "例如：需求文档"} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
          </>
        ) : null}
        {target.mode === "document" && documentSource === "upload" ? (
          <label className="mt-4 block rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
            <span className="block font-medium text-slate-700">上传 Markdown 或压缩包</span>
            <span className="mt-1 block text-xs text-slate-500">.md 会直接生成文档；.zip 需包含 1 个 .md 文件和可选 assets 目录。</span>
            <input
              name="sourceFile"
              type="file"
              accept=".md,.zip,text/markdown,application/zip"
              className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
            />
          </label>
        ) : null}
        {target.mode === "document" && documentSource === "batch" ? (
          <label className="mt-6 block rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
            <span className="block font-medium text-slate-700">上传批量 ZIP</span>
            <span className="mt-1 block text-xs text-slate-500">ZIP 内每个 .zip 对应一篇文档，内层 ZIP 需包含 1 个 .md 文件和可选 assets 目录；最多 50 篇，外层 ZIP、内层 ZIP 总量及解压后总量均最大 500 MB。</span>
            <input
              name="batchFile"
              type="file"
              accept=".zip,application/zip"
              className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
            />
          </label>
        ) : null}
        {batchProgress ? (
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-700">{batchProgress.totalCount > 0 ? "正在处理文档" : "正在解析压缩包"}</span>
              <span className="tabular-nums text-blue-700">{batchProgress.totalCount > 0 ? `${Math.round((batchProgress.processedCount / batchProgress.totalCount) * 100)}%` : "准备中"}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100" role="progressbar" aria-valuemin={0} aria-valuemax={batchProgress.totalCount || undefined} aria-valuenow={batchProgress.totalCount > 0 ? batchProgress.processedCount : undefined}>
              <div className={`h-full rounded-full bg-blue-600 transition-[width] duration-300 ${batchProgress.totalCount === 0 ? "animate-pulse" : ""}`} style={{ width: batchProgress.totalCount > 0 ? `${(batchProgress.processedCount / batchProgress.totalCount) * 100}%` : "20%" }} />
            </div>
            {batchProgress.totalCount > 0 ? <p className="mt-2 text-xs text-slate-500">已处理 {batchProgress.processedCount} / {batchProgress.totalCount}{batchProgress.archiveName ? ` · ${batchProgress.archiveName}` : ""}</p> : null}
          </div>
        ) : null}
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
        {batchResult ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">批量导入完成</p>
            <p className="mt-1 text-slate-600">共 {batchResult.totalCount} 篇，成功 {batchResult.createdCount} 篇，失败 {batchResult.failedCount} 篇。</p>
            {batchResult.failedArchives.length > 0 ? (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="font-medium text-red-600">失败的文档 ZIP</p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {batchResult.failedArchives.map((archiveName) => <li key={archiveName} className="break-all">{archiveName}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          {batchResult ? (
            <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">完成</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">取消</button>
              <button type="submit" disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? (documentSource === "batch" ? "导入中..." : "创建中...") : documentSource === "batch" ? "开始批量导入" : "创建"}</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function RenameDirectoryModal({ target, onClose, onRenamed }: { target: RenameTarget; onClose: () => void; onRenamed: (name: string) => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("directoryId", target.id);

    startTransition(async () => {
      try {
        const result = await renameDirectory(formData);
        onRenamed(result.title);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "目录重命名失败，请稍后重试。");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/15">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold text-slate-950">重命名目录</h2><p className="mt-1 text-sm text-slate-500">修改目录名称不会影响其中的子目录和文档。</p></div>
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">✕</button>
        </div>
        <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="rename-directory-title">目录名称</label>
        <input id="rename-directory-title" name="title" defaultValue={target.name} autoFocus required maxLength={120} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100" onFocus={(event) => event.currentTarget.select()} />
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">取消</button>
          <button type="submit" disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? "保存中..." : "保存"}</button>
        </div>
      </form>
    </div>
  );
}

type WikiHomeContentProps = WikiHomeProps & {
  expandedNodeKeys: ReadonlySet<string>;
  onToggleNode: (key: string) => void;
};

function WikiHomeContent({
  userName,
  directories,
  documents: initialTreeDocuments,
  initialDirectoryPage,
  expandedNodeKeys,
  onToggleNode,
}: WikiHomeContentProps) {
  const router = useRouter();
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [draggingItem, setDraggingItem] = useState<DraggingItem>(null);
  const [activeDropZoneKey, setActiveDropZoneKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [documents, setDocuments] = useState(() => {
    const byId = new Map(initialTreeDocuments.map((document) => [document.id, document]));
    for (const document of initialDirectoryPage.documents) byId.set(document.id, document);
    return Array.from(byId.values());
  });
  const [currentDocuments, setCurrentDocuments] = useState(initialDirectoryPage.documents);
  const [totalDocuments, setTotalDocuments] = useState(initialDirectoryPage.totalDocuments);
  const [nextCursor, setNextCursor] = useState(initialDirectoryPage.nextCursor);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isMutating, startMutation] = useTransition();
  const directoryRequestId = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const root = directories[0];
  const [selectedDirectory, setSelectedDirectory] = useState<SelectedDirectory | null>(
    root ? { key: `space:${root.spaceId}`, name: root.name, kind: "space", spaceId: root.spaceId, parentId: null } : null,
  );

  const defaultTarget = useMemo<CreateTarget | null>(() => {
    if (!selectedDirectory) return root ? { mode: "document", spaceId: root.spaceId, parentId: null, parentName: root.name } : null;
    return { mode: "document", spaceId: selectedDirectory.spaceId, parentId: selectedDirectory.parentId, parentName: selectedDirectory.name };
  }, [root, selectedDirectory]);

  const visibleDocuments = useMemo(() => {
    return [...currentDocuments].sort((a, b) => {
      const result = sortKey === "title" ? a.title.localeCompare(b.title, "zh-CN") : a.updatedAtMs - b.updatedAtMs;
      return sortDir === "asc" ? result : -result;
    });
  }, [currentDocuments, sortDir, sortKey]);

  const visibleDirectories = useMemo(() => {
    if (activeSearchQuery || !selectedDirectory) return [];

    function findNode(nodes: DirectoryNode[], id: string): DirectoryNode | null {
      for (const node of nodes) {
        if (node.kind === "directory" && node.id === id) return node;
        const child = findNode(node.children, id);
        if (child) return child;
      }
      return null;
    }

    const children = selectedDirectory.kind === "space"
      ? directories.find((node) => node.kind === "space" && node.spaceId === selectedDirectory.spaceId)?.children ?? []
      : selectedDirectory.parentId
        ? findNode(directories, selectedDirectory.parentId)?.children ?? []
        : [];

    return [...children].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [activeSearchQuery, directories, selectedDirectory]);

  function switchSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((value) => (value === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir(nextKey === "title" ? "asc" : "desc");
    }
  }

  function refresh() {
    router.refresh();
  }

  function buildDirectoryDocumentsUrl(directory: SelectedDirectory, cursor?: string | null) {
    const searchParams = new URLSearchParams({
      spaceId: directory.spaceId,
      parentId: directory.kind === "space" ? "root" : directory.parentId ?? "root",
    });
    if (cursor) searchParams.set("cursor", cursor);
    return `/api/notes?${searchParams.toString()}`;
  }

  function buildSearchDocumentsUrl(query: string, cursor?: string | null) {
    const searchParams = new URLSearchParams({ query });
    if (cursor) searchParams.set("cursor", cursor);
    return `/api/notes?${searchParams.toString()}`;
  }

  function mergeDocuments(nextDocuments: DocumentRow[]) {
    setDocuments((current) => {
      const byId = new Map(current.map((document) => [document.id, document]));
      for (const document of nextDocuments) byId.set(document.id, document);
      return Array.from(byId.values());
    });
  }

  async function loadMoreDocuments() {
    if ((!selectedDirectory && !activeSearchQuery) || !nextCursor || isLoadingMore || isLoadingDirectory) return;

    const requestId = directoryRequestId.current;
    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const url = activeSearchQuery
        ? buildSearchDocumentsUrl(activeSearchQuery, nextCursor)
        : buildDirectoryDocumentsUrl(selectedDirectory as SelectedDirectory, nextCursor);
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (HomeDocumentPage & { message?: string }) | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "加载历史文档失败，请稍后重试。");
      }
      if (directoryRequestId.current !== requestId) return;

      setCurrentDocuments((current) => {
        const byId = new Map(current.map((document) => [document.id, document]));
        for (const document of payload.documents) byId.set(document.id, document);
        return Array.from(byId.values());
      });
      mergeDocuments(payload.documents);
      setTotalDocuments(payload.totalDocuments);
      setNextCursor(payload.nextCursor);
    } catch (error) {
      if (directoryRequestId.current !== requestId) return;
      setLoadMoreError(error instanceof Error ? error.message : "加载历史文档失败，请稍后重试。");
    } finally {
      if (directoryRequestId.current === requestId) setIsLoadingMore(false);
    }
  }

  function runDirectoryMutation(work: () => Promise<void>) {
    setFeedback(null);
    startMutation(async () => {
      try {
        await work();
        setDraggingItem(null);
        refresh();
      } catch (caught) {
        setFeedback({ tone: "error", message: caught instanceof Error ? caught.message : "操作失败，请稍后重试。" });
      }
    });
  }

  function handleDeleteDirectory(node: DirectoryNode) {
    const confirmed = window.confirm(`确定删除目录“${node.name}”吗？该目录下的子目录和文档也会一起移入回收站。`);
    if (!confirmed) return;
    runDirectoryMutation(async () => {
      const formData = new FormData();
      formData.set("directoryId", node.id);
      await deleteDirectory(formData);
    });
  }

  function handleDeleteDocument(document: DocumentRow) {
    const confirmed = window.confirm(`确定删除文档“${document.title}”吗？该文档会移入回收站。`);
    if (!confirmed) return;

    runDirectoryMutation(async () => {
      const formData = new FormData();
      formData.set("documentId", document.id);
      await deleteWikiDocument(formData);
    });
  }

  function handleMoveDirectory(directoryId: string, target: MoveTarget) {
    runDirectoryMutation(async () => {
      const formData = new FormData();
      formData.set("directoryId", directoryId);
      formData.set("targetKind", target.targetKind);
      formData.set("targetId", target.targetId);
      const result = await moveDirectory(formData);
      if (result?.moved) {
        setFeedback({ tone: "success", message: `文件夹及其 ${Math.max(result.affectedItemCount - 1, 0)} 个子项目已移动。` });
      }
    });
  }

  function handleDirectoryDragStart(event: DragEvent<HTMLDivElement>, directory: DirectoryNode) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", directory.id);
    event.dataTransfer.setData("application/x-wewiki-item", JSON.stringify({ type: "directory", id: directory.id }));
    setDraggingItem({ type: "directory", id: directory.id });
  }

  function handleMoveDocument(documentId: string, target: MoveTarget) {
    runDirectoryMutation(async () => {
      const formData = new FormData();
      formData.set("documentId", documentId);
      formData.set("targetKind", target.targetKind);
      formData.set("targetId", target.targetId);
      await moveWikiDocument(formData);
    });
  }

  function handleDocumentDragStart(event: DragEvent<HTMLDivElement>, document: DocumentRow) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", document.id);
    event.dataTransfer.setData("application/x-wewiki-item", JSON.stringify({ type: "document", id: document.id }));
    setDraggingItem({ type: "document", id: document.id });
  }

  function selectDirectory(directory: SelectedDirectory) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSelectedDirectory(directory);
    setSearchQuery("");
    setActiveSearchQuery("");
    setCurrentDocuments([]);
    setTotalDocuments(0);
    setNextCursor(null);
    setLoadMoreError(null);
    setIsLoadingMore(false);
    setIsLoadingDirectory(true);

    const requestId = ++directoryRequestId.current;
    void fetch(buildDirectoryDocumentsUrl(directory), { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (HomeDocumentPage & { message?: string }) | null;
        if (!response.ok || !payload) {
          throw new Error(payload?.message ?? "加载目录内容失败，请稍后重试。");
        }
        if (directoryRequestId.current !== requestId) return;

        setCurrentDocuments(payload.documents);
        mergeDocuments(payload.documents);
        setTotalDocuments(payload.totalDocuments);
        setNextCursor(payload.nextCursor);
      })
      .catch((error) => {
        if (directoryRequestId.current !== requestId) return;
        setLoadMoreError(error instanceof Error ? error.message : "加载目录内容失败，请稍后重试。");
      })
      .finally(() => {
        if (directoryRequestId.current === requestId) setIsLoadingDirectory(false);
      });
  }

  function updateSearch(value: string) {
    const query = value.trim();
    setSearchQuery(value);
    setActiveSearchQuery(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const requestId = ++directoryRequestId.current;
    setCurrentDocuments([]);
    setTotalDocuments(0);
    setNextCursor(null);
    setLoadMoreError(null);
    setIsLoadingMore(false);

    if (!query && !selectedDirectory) {
      setIsLoadingDirectory(false);
      return;
    }

    setIsLoadingDirectory(true);
    const url = query
      ? buildSearchDocumentsUrl(query)
      : buildDirectoryDocumentsUrl(selectedDirectory as SelectedDirectory);

    searchTimer.current = setTimeout(() => {
      void fetch(url, { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as (HomeDocumentPage & { message?: string }) | null;
          if (!response.ok || !payload) {
            throw new Error(payload?.message ?? (query ? "搜索文档失败，请稍后重试。" : "加载目录内容失败，请稍后重试。"));
          }
          if (directoryRequestId.current !== requestId) return;

          setCurrentDocuments(payload.documents);
          mergeDocuments(payload.documents);
          setTotalDocuments(payload.totalDocuments);
          setNextCursor(payload.nextCursor);
        })
        .catch((error) => {
          if (directoryRequestId.current !== requestId) return;
          setLoadMoreError(error instanceof Error ? error.message : "搜索文档失败，请稍后重试。");
        })
        .finally(() => {
          if (directoryRequestId.current === requestId) setIsLoadingDirectory(false);
        });
    }, query ? 300 : 0);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    updateSearch(event.currentTarget.value);
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] p-4 text-slate-900 sm:p-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-100 bg-white md:flex">
          <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-7"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">W</div><span className="font-semibold text-slate-950">Wiki</span></div>
          <div className="flex flex-1 flex-col justify-between overflow-auto p-4">
            <div className="space-y-7">
              <nav className="space-y-1"><SidebarNavItem icon="home" label="首页" active /><SidebarNavItem icon="doc" label="我的文档" /><SidebarNavItem icon="share" label="与我共享" /><SidebarNavItem icon="star" label="收藏" /><SidebarNavItem icon="trash" label="回收站" onClick={() => router.push("/notes/trash")} /></nav>
              <DirectoryTree
                directories={directories}
                documents={documents}
                selectedKey={selectedDirectory?.key ?? ""}
                draggingItem={draggingItem}
                isMutating={isMutating}
                onSelectDirectory={selectDirectory}
                onCreate={setCreateTarget}
                onRename={setRenameTarget}
                onDelete={handleDeleteDirectory}
                onDeleteDocument={handleDeleteDocument}
                onDragStart={setDraggingItem}
                onDragEnd={() => {
                  setDraggingItem(null);
                  setActiveDropZoneKey(null);
                }}
                expandedNodeKeys={expandedNodeKeys}
                onToggleNode={onToggleNode}
                activeDropZoneKey={activeDropZoneKey}
                onDropZoneChange={setActiveDropZoneKey}
                onMoveDirectory={handleMoveDirectory}
                onMoveDocument={handleMoveDocument}
                router={router}
              />
            </div>
            <div className="space-y-2 pt-6"><button type="button" onClick={() => root && setCreateTarget({ mode: "directory", spaceId: root.spaceId, parentId: null, parentName: root.name })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"><Icon name="plus" />新建目录</button><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="设置"><Icon name="settings" /></button></div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-100 px-4 sm:px-8">
            <label className="flex h-10 w-full max-w-[380px] items-center gap-2 rounded-xl bg-slate-50 px-4 text-slate-400 ring-1 ring-slate-100 focus-within:bg-white focus-within:ring-blue-200"><Icon name="search" /><input type="search" value={searchQuery} onChange={handleSearchChange} maxLength={200} className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" placeholder="搜索文档标题或内容..." aria-label="搜索文档" />{searchQuery ? <button type="button" onClick={() => updateSearch("")} className="rounded px-1.5 py-0.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="清空搜索">×</button> : <span className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-400 ring-1 ring-slate-200">/</span>}</label>
            <div className="flex items-center gap-3"><button type="button" onClick={() => defaultTarget && setCreateTarget(defaultTarget)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-500"><Icon name="plus" />创建文档</button><button type="button" className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-50 sm:inline-flex" aria-label="通知"><Icon name="bell" /></button><div className="flex items-center gap-2 border-l border-slate-100 pl-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{userName.slice(0, 1).toUpperCase()}</div><span className="hidden max-w-24 truncate text-sm font-medium text-slate-700 sm:inline">{userName}</span><SignOutButton className="hidden rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 lg:inline-flex" /></div></div>
          </header>

          <section className="flex-1 overflow-auto px-4 py-6 sm:px-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div><h1 className="text-lg font-semibold text-slate-950">{activeSearchQuery ? `搜索：${activeSearchQuery}` : selectedDirectory?.name ?? "全部文档"}</h1><p className="mt-1 text-sm text-slate-500">{activeSearchQuery ? "正在搜索所有可访问文档的标题和正文内容。" : "拖动文件夹或文档到左侧目录树可移动位置；移动文件夹时会连同全部子目录和文档一起移动。"}</p></div>
              <button type="button" onClick={() => defaultTarget && setCreateTarget({ ...defaultTarget, mode: "directory" })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 md:hidden">新建目录</button>
            </div>
            {feedback ? <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`}>{feedback.message}</div> : null}
            {isMutating ? <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-600">正在处理位置变更...</div> : null}

            <div className="min-w-[720px]">
              <div className="grid grid-cols-[minmax(260px,1.4fr)_minmax(180px,0.9fr)_150px_100px] border-b border-slate-100 px-2 pb-3 text-xs font-semibold text-slate-500">
                <SortButton label="标题" active={sortKey === "title"} dir={sortDir} onClick={() => switchSort("title")} />
                <span>所属目录</span>
                <SortButton label="最近更新" active={sortKey === "updatedAt"} dir={sortDir} onClick={() => switchSort("updatedAt")} />
                <span>更新者</span>
              </div>
              <div className="divide-y divide-slate-100">
                {visibleDirectories.map((directory) => (
                  <div
                    key={directory.id}
                    draggable={!isMutating}
                    onDragStart={(event) => handleDirectoryDragStart(event, directory)}
                    onDragEnd={() => setDraggingItem(null)}
                    onDoubleClick={() => selectDirectory({ key: directory.id, name: directory.name, kind: "directory", spaceId: directory.spaceId, parentId: directory.id })}
                    title="双击进入文件夹；拖动到左侧目录或空间可连同全部内容一起移动"
                    className={`grid w-full cursor-grab grid-cols-[minmax(260px,1.4fr)_minmax(180px,0.9fr)_150px_100px] items-center px-2 py-4 text-left text-sm transition hover:bg-blue-50/60 active:cursor-grabbing ${draggingItem?.type === "directory" && draggingItem.id === directory.id ? "opacity-45" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-3 font-semibold text-slate-900"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500"><Icon name="folder" /></span><span className="truncate">{directory.name}</span></div>
                    <div className="text-slate-500">{directory.children.length} 个子文件夹</div><div className="text-slate-400">—</div><div className="text-slate-400">—</div>
                  </div>
                ))}
                {visibleDocuments.map((document) => (
                  <div
                    key={document.id}
                    draggable={!isMutating}
                    onDragStart={(event) => handleDocumentDragStart(event, document)}
                    onDragEnd={() => setDraggingItem(null)}
                    onDoubleClick={() => router.push(`/notes/${document.id}`)}
                    aria-label={`${document.title}；双击打开，可拖动到左侧目录或空间`}
                    className={`grid w-full cursor-grab grid-cols-[minmax(260px,1.4fr)_minmax(180px,0.9fr)_150px_100px] items-center px-2 py-4 text-left text-sm transition hover:bg-slate-50/80 active:cursor-grabbing ${draggingItem?.type === "document" && draggingItem.id === document.id ? "opacity-45" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-3 font-medium text-slate-900"><DocumentIcon color={document.color} /><DocumentTitle title={document.title} /></div>
                    <div className="truncate text-slate-500">{document.directory}</div><div className="text-slate-500">{document.updatedAt}</div><div className="truncate text-slate-600">{document.editor}</div>
                  </div>
                ))}
                {isLoadingDirectory && visibleDocuments.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">{activeSearchQuery ? "正在搜索文档..." : "正在加载当前目录..."}</div> : null}
                {!isLoadingDirectory && visibleDirectories.length === 0 && visibleDocuments.length === 0 ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-20 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon name={activeSearchQuery ? "search" : "doc"} /></div><h2 className="mt-4 font-semibold text-slate-900">{activeSearchQuery ? "没有找到匹配的文档" : "当前目录还没有内容"}</h2><p className="mt-2 text-sm text-slate-500">{activeSearchQuery ? "请尝试更换或缩短搜索关键词。" : "可以新建文件夹或文档。"}</p></div> : null}
              </div>
              <div className="flex flex-col items-center gap-3 border-t border-slate-100 px-4 py-5">
                <p className="text-xs text-slate-500">{activeSearchQuery ? `搜索到 ${totalDocuments} 篇文档，已加载 ${currentDocuments.length} 篇` : `当前目录已加载 ${currentDocuments.length} / 共 ${totalDocuments} 篇文档`}</p>
                {loadMoreError ? <p className="text-sm text-red-600">{loadMoreError}</p> : null}
                {!isLoadingDirectory && nextCursor ? (
                  <button
                    type="button"
                    onClick={loadMoreDocuments}
                    disabled={isLoadingMore}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingMore ? "正在加载..." : `加载更多（剩余 ${Math.max(totalDocuments - currentDocuments.length, 0)} 篇）`}
                  </button>
                ) : !isLoadingDirectory && totalDocuments > 0 ? <p className="text-xs text-slate-400">{activeSearchQuery ? "已加载全部搜索结果" : "已加载当前目录全部文档"}</p> : null}
              </div>
            </div>
          </section>
        </div>
      </section>
      {createTarget ? <CreateModal target={createTarget} onClose={() => setCreateTarget(null)} onCreated={refresh} /> : null}
      {renameTarget ? <RenameDirectoryModal target={renameTarget} onClose={() => setRenameTarget(null)} onRenamed={(name) => {
        if (selectedDirectory?.parentId === renameTarget.id) {
          setSelectedDirectory({ ...selectedDirectory, name });
        }
        setRenameTarget(null);
        setFeedback({ tone: "success", message: `目录已重命名为“${name}”。` });
        refresh();
      }} /> : null}
    </main>
  );
}

export function WikiHome(props: WikiHomeProps) {
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<Set<string>>(() => new Set());

  function toggleNode(key: string) {
    setExpandedNodeKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <WikiHomeContent
      key={props.dataVersion}
      {...props}
      expandedNodeKeys={expandedNodeKeys}
      onToggleNode={toggleNode}
    />
  );
}
