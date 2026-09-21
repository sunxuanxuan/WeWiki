"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={
        className ??
        "rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 transition hover:border-cyan-300/50 hover:text-cyan-100"
      }
    >
      退出登录
    </button>
  );
}
