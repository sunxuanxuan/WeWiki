import { NextResponse } from "next/server";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status },
  );
}
