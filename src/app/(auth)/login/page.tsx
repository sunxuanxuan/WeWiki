import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { authOptions } from "@/lib/auth";

export const metadata = {
  title: "登录 - WeWiki",
};

function LoginFormFallback() {
  return (
    <div className="mt-8 h-[430px] animate-pulse rounded-2xl bg-slate-100" aria-label="正在加载登录表单" />
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: "doc" | "folder" | "shield";
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
        {icon === "doc" ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".15" />
            <path d="M14 3v5h5M9 13h6M9 17h4M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        {icon === "folder" ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4.2l2 2H18a2.5 2.5 0 0 1 2.5 2.5V17A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7.5Z" fill="currentColor" opacity=".15" />
            <path d="M3.5 8A2.5 2.5 0 0 1 6 5.5h4.2l2 2H18A2.5 2.5 0 0 1 20.5 10v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        ) : null}
        {icon === "shield" ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3.5 19 6v5.2c0 4.4-2.8 8.3-7 9.6-4.2-1.3-7-5.2-7-9.6V6l7-2.5Z" fill="currentColor" opacity=".15" />
            <path d="M12 3.5 19 6v5.2c0 4.4-2.8 8.3-7 9.6-4.2-1.3-7-5.2-7-9.6V6l7-2.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="m9.5 12 1.8 1.8 3.7-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function LoginIllustration() {
  return (
    <div className="pointer-events-none relative mt-11 h-72 max-w-[430px] overflow-hidden">
      <div className="absolute bottom-4 left-9 h-36 w-36 rounded-full bg-blue-200/25 blur-2xl" />
      <div className="absolute bottom-0 left-8 h-5 w-72 rounded-[50%] bg-blue-300/30 blur-md" />

      <div className="absolute bottom-5 left-24 h-40 w-48 rounded-2xl bg-white shadow-[0_24px_60px_rgba(37,99,235,0.18)] ring-1 ring-blue-100">
        <div className="h-9 rounded-t-2xl bg-gradient-to-r from-blue-500 to-blue-300 px-4 py-3">
          <div className="flex gap-2">
            <span className="h-2 w-2 rounded-full bg-white/90" />
            <span className="h-2 w-2 rounded-full bg-white/75" />
            <span className="h-2 w-2 rounded-full bg-white/60" />
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500 text-2xl font-semibold text-white shadow-lg shadow-blue-500/25">W</div>
            <div className="space-y-2">
              <div className="h-3 w-24 rounded-full bg-blue-100" />
              <div className="h-3 w-16 rounded-full bg-slate-100" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-3 w-36 rounded-full bg-slate-100" />
            <div className="h-3 w-28 rounded-full bg-slate-100" />
            <div className="h-3 w-40 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-4 h-28 w-28 rounded-2xl bg-white/80 p-4 shadow-xl shadow-blue-200/40 ring-1 ring-blue-100 backdrop-blur">
        <div className="absolute bottom-2 left-4 h-12 w-3 rounded-t-lg bg-blue-300" />
        <div className="absolute bottom-2 left-9 h-20 w-3 rounded-t-lg bg-blue-500" />
        <div className="absolute bottom-2 left-14 h-16 w-3 rounded-t-lg bg-blue-200" />
        <div className="absolute left-4 top-4 h-12 w-12 rounded-full border-8 border-blue-100" />
      </div>

      <div className="absolute bottom-10 right-9 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-300 to-blue-600 text-white shadow-2xl shadow-blue-500/30">
        <svg className="h-11 w-11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" fill="white" opacity=".92" />
        </svg>
      </div>

      <div className="absolute right-0 top-20 flex h-16 w-28 items-center gap-3 rounded-xl bg-white/70 px-4 shadow-lg shadow-blue-100/70 ring-1 ring-blue-50 backdrop-blur">
        <div className="h-8 w-8 rounded-lg bg-blue-100" />
        <div className="space-y-2">
          <div className="h-2 w-12 rounded-full bg-blue-100" />
          <div className="h-2 w-8 rounded-full bg-slate-100" />
        </div>
      </div>

      <div className="absolute bottom-3 left-0">
        <div className="h-20 w-16 rounded-t-[40px] bg-emerald-300/70" />
        <div className="absolute bottom-0 left-8 h-24 w-14 rounded-t-[40px] bg-blue-300/60" />
        <div className="absolute bottom-0 left-5 h-14 w-20 rounded-t-3xl bg-white shadow-lg ring-1 ring-blue-50" />
      </div>
    </div>
  );
}

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/notes");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fc] px-5 py-10 text-slate-900">
      <section className="relative grid w-full max-w-[1120px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[1fr_480px]">
        <div className="relative hidden min-h-[660px] overflow-hidden bg-gradient-to-br from-blue-50 via-white to-blue-50/80 px-12 py-10 lg:block">
          <div className="absolute -top-24 left-80 h-64 w-64 rounded-full bg-blue-100/60" />
          <div className="absolute left-8 top-80 h-40 w-40 rounded-full border border-blue-100/60" />
          <div className="absolute inset-0 bg-[radial-gradient(#dbeafe_1px,transparent_1px)] [background-size:14px_14px] opacity-30" />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-lg font-bold text-white shadow-sm shadow-blue-600/20">W</div>
              <span className="text-xl font-bold text-slate-950">Wiki</span>
            </div>

            <div className="mt-24 max-w-sm">
              <h1 className="text-4xl font-bold tracking-tight text-slate-950">
                欢迎使用 <span className="text-blue-600">Wiki</span>
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-600">
                高效的文档协作与知识管理平台
                <br />
                让团队知识沉淀更简单
              </p>
            </div>

            <div className="mt-10 space-y-7">
              <FeatureItem icon="doc" title="文档协作" description="多人实时协作，内容即时同步" />
              <FeatureItem icon="folder" title="知识管理" description="结构化知识库，查找更便捷" />
              <FeatureItem icon="shield" title="安全可靠" description="多重权限控制，数据安全保障" />
            </div>

            <LoginIllustration />
          </div>
        </div>

        <div className="flex min-h-[660px] items-center justify-center px-5 py-10 sm:px-10">
          <section className="w-full max-w-[430px] rounded-2xl bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.10)] ring-1 ring-slate-100 sm:p-10">
            <div className="text-center">
              <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-lg font-bold text-white">W</div>
                <span className="text-xl font-bold text-slate-950">Wiki</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-950">
                登录 <span className="text-blue-600">Wiki</span>
              </h2>
              <p className="mt-4 text-sm text-slate-500">
                还没有账号？
                <button type="button" className="ml-2 font-semibold text-blue-600 hover:text-blue-500">
                  立即注册
                </button>
              </p>
            </div>

            <Suspense fallback={<LoginFormFallback />}>
              <LoginForm />
            </Suspense>
          </section>
        </div>
      </section>

      <footer className="mt-8 text-center text-xs text-slate-400">
        <p>© 2024 Wiki. All rights reserved.</p>
        <div className="mt-3 flex items-center justify-center gap-5">
          <button type="button" className="hover:text-slate-600">隐私政策</button>
          <button type="button" className="hover:text-slate-600">服务条款</button>
          <button type="button" className="hover:text-slate-600">帮助中心</button>
        </div>
      </footer>
    </main>
  );
}
