"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateWikiDocument } from "@/app/(wiki)/notes/actions";

export type EditableDocument = {
  id: string;
  title: string;
  content: string;
  directory: string;
  updatedAt: string;
};

export function DocumentEditForm({ document }: { document: EditableDocument }) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      <form
        onSubmit={handleSubmit}
        className="mx-auto min-h-[calc(100vh-3rem)] max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
      >
        <header className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <Link href="/notes" className="font-medium text-blue-600 hover:text-blue-500">
                ← 返回首页
              </Link>
              <span>/</span>
              <span className="truncate">{document.directory}</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">编辑文档</h1>
            <p className="mt-1 text-sm text-slate-500">最后更新：{document.updatedAt}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/notes"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/20 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "保存中..." : "保存"}
            </button>
          </div>
        </header>

        <section className="px-6 py-6">
          <input type="hidden" name="documentId" value={document.id} />

          <label className="text-sm font-medium text-slate-700" htmlFor="title">
            标题
          </label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={120}
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-lg font-semibold text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />

          <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="content">
            内容 Markdown
          </label>
          <textarea
            id="content"
            name="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="输入 Markdown 内容..."
            className="mt-2 min-h-[520px] w-full resize-y rounded-xl border border-slate-200 p-4 font-mono text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />

          {message ? (
            <p className={`mt-4 rounded-xl px-4 py-3 text-sm ${message === "已保存" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
              {message}
            </p>
          ) : null}
        </section>
      </form>
    </main>
  );
}
