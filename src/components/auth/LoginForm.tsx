"use client";

import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function getSafeCallbackUrl(value: string | null) {
  if (!value) return "/notes";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/notes";
}

function MailIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6.5h16v11H4v-11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10V8a5 5 0 0 1 10 0v2M6.5 10h11A1.5 1.5 0 0 1 19 11.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ closed }: { closed: boolean }) {
  return closed ? (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 4 16 16M10.6 10.6a2 2 0 0 0 2.8 2.8M8.4 6.6A10.7 10.7 0 0 1 12 6c5 0 8.5 4 9.5 6a11.8 11.8 0 0 1-2.8 3.6M6.4 8.3A12.5 12.5 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.1 0 2.1-.2 3-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12c1-2 4.5-6 9.5-6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => getSafeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams],
  );
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    authError ? "登录失败，请检查账号和密码。" : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setIsSubmitting(false);

    if (!result?.ok) {
      setError("登录失败，请检查账号、密码或用户状态。");
      return;
    }

    router.push(result.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-800" htmlFor="email">
          邮箱 / 用户名
        </label>
        <div className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100/70">
          <MailIcon />
          <input
            id="email"
            name="email"
            type="text"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="请输入邮箱或用户名"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-800" htmlFor="password">
          密码
        </label>
        <div className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100/70">
          <LockIcon />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            minLength={1}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="请输入密码"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
          >
            <EyeIcon closed={!showPassword} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="inline-flex cursor-pointer items-center gap-2 text-slate-500">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600"
          />
          记住我
        </label>
        <button type="button" className="font-semibold text-blue-600 transition hover:text-blue-500">
          忘记密码？
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "登录中..." : "登录"}
      </button>

      <div className="flex items-center gap-4 py-1">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">或使用以下方式登录</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">W</span>
          使用企业 SSO 登录
        </button>
        <button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <span className="text-lg font-bold text-[#4285f4]">G</span>
          使用 Google 账号登录
        </button>
      </div>
    </form>
  );
}
