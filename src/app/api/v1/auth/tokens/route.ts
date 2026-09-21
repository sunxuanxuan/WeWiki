import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-response";
import { createPersonalAccessToken, hashApiToken, normalizeScopes } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(366).optional(),
});

function serializeToken(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
  };
}

async function requireSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? session.user : null;
}

export async function GET() {
  const user = await requireSessionUser();
  if (!user?.id) {
    return apiError(401, "unauthorized", "请先登录后再查看个人访问令牌。");
  }

  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return Response.json({ data: tokens.map(serializeToken) });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user?.id) {
    return apiError(401, "unauthorized", "请先登录后再创建个人访问令牌。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "请求体必须是合法 JSON。 ");
  }

  const parsed = createTokenSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "invalid_request", "个人访问令牌参数不合法。", parsed.error.flatten());
  }

  const rawToken = createPersonalAccessToken();
  const tokenHash = hashApiToken(rawToken);
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const token = await prisma.apiToken.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      tokenHash,
      tokenPrefix: rawToken.slice(0, 18),
      scopes: normalizeScopes(parsed.data.scopes),
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "api_token.created",
      targetType: "api_token",
      targetId: token.id,
      metadata: { name: token.name, scopes: token.scopes },
    },
  });

  return Response.json(
    {
      data: {
        ...serializeToken(token),
        token: rawToken,
      },
      warning: "请立即保存 token，服务端不会再次展示完整令牌。",
    },
    { status: 201 },
  );
}
