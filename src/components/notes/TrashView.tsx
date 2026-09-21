"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { permanentlyDeleteTrashNote, restoreTrashNote } from "@/app/(wiki)/notes/actions";

export type TrashRow = {
  id: string;
  title: string;
  type: "directory" | "document";
  directory: string;
  deletedAt: string;
  daysLeft: number;
};

function TrashIcon({ type }: { type: TrashRow["type"] }) {
  return (
    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${type === "directory" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
      {type === "directory" ? "📁" : "D"}
    </span>
  );
}

export function TrashView({ userName, items }: { userName: string; items: TrashRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runTrashAction(work: () => Promise<void>) {
    setMessage(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "操作失败，请稍后重试。");
      }
    });
  }

  function handleRestore(item: TrashRow) {
    runTrashAction(async () => {
      const formData = new FormData();
      formData.set("noteId", item.id);
      await restoreTrashNote(formData);
    });
  }

  function handlePermanentDelete(item: TrashRow) {
    const confirmed = window.confirm(`确定彻底删除“${item.title}”吗？该操作不可恢复。`);
    if (!confirmed) return;

    runTrashAction(async () => {
      const formData = new FormData();
      formData.set("noteId", item.id);
      await permanentlyDeleteTrashNote(formData);
    });
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] p-4 text-slate-900 sm:p-6">
      <section className="mx-auto min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <header className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <Link href="/notes" className="font-medium text-blue-600 hover:text-blue-500">← 返回首页</Link>
              <span>/</span>
              <span>回收站</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">回收站</h1>
            <p className="mt-1 text-sm text-slate-500">删除的文件和目录会保留 30 天，之后自动彻底删除。</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{userName}</span>
            <Link href="/notes" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
              回到首页
            </Link>
          </div>
        </header>

        <section className="px-6 py-6">
          {message ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div> : null}
          {isPending ? <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-600">正在处理回收站操作...</div> : null}

          {items.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[minmax(260px,1.3fr)_minmax(220px,1fr)_150px_120px_180px] bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                <span>名称</span>
                <span>原位置</span>
                <span>删除时间</span>
                <span>剩余时间</span>
                <span className="text-right">操作</span>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[minmax(260px,1.3fr)_minmax(220px,1fr)_150px_120px_180px] items-center px-4 py-4 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <TrashIcon type={item.type} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.type === "directory" ? "目录" : "文档"}</p>
                      </div>
                    </div>
                    <div className="truncate text-slate-500">{item.directory}</div>
                    <div className="text-slate-500">{item.deletedAt}</div>
                    <div className={item.daysLeft <= 3 ? "font-medium text-red-500" : "text-slate-500"}>
                      {item.daysLeft > 0 ? `${item.daysLeft} 天` : "即将清理"}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleRestore(item)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handlePermanentDelete(item)}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        彻底删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-2xl">🗑️</div>
              <h2 className="mt-4 font-semibold text-slate-900">回收站为空</h2>
              <p className="mt-2 text-sm text-slate-500">删除的文档和目录会先出现在这里。</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
