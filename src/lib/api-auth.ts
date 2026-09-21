import { createHash, randomBytes } from "node:crypto";
import { GlobalRole, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-response";

export const API_SCOPES = ["notes:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const API_TOKEN_PREFIX = "wwpat";

export type ApiPrincipal = {
  userId: string;
  email: string;
  name: string | null;
  globalRole: GlobalRole;
  scopes: ApiScope[];
  tokenId: string;
};

export type ApiAuthResult =
  | { ok: true; principal: ApiPrincipal }
  | { ok: false; response: ReturnType<typeof apiError> };

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

export function normalizeScopes(scopes: unknown, fallback: ApiScope[] = ["notes:read"]) {
  if (!Array.isArray(scopes)) return fallback;

  const normalized = Array.from(new Set(scopes.filter((scope): scope is ApiScope => typeof scope === "string" && isApiScope(scope))));
  return normalized.length > 0 ? normalized : fallback;
}

export function createPersonalAccessToken() {
  return `${API_TOKEN_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticateApiRequest(request: Request, requiredScope: ApiScope): Promise<ApiAuthResult> {
  const token = getBearerToken(request);

  if (!token) {
    return {
      ok: false,
      response: apiError(401, "missing_bearer_token", "请在 Authorization 请求头中提供 Bearer 个人访问令牌。"),
    };
  }

  if (!token.startsWith(`${API_TOKEN_PREFIX}_`)) {
    return {
      ok: false,
      response: apiError(401, "invalid_token", "个人访问令牌格式不正确。"),
    };
  }

  const tokenHash = hashApiToken(token);
  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          globalRole: true,
          status: true,
        },
      },
    },
  });

  if (!apiToken || apiToken.revokedAt) {
    return {
      ok: false,
      response: apiError(401, "invalid_token", "个人访问令牌不存在或已被撤销。"),
    };
  }

  if (apiToken.expiresAt && apiToken.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      response: apiError(401, "token_expired", "个人访问令牌已过期。"),
    };
  }

  if (apiToken.user.status !== UserStatus.ACTIVE) {
    return {
      ok: false,
      response: apiError(403, "user_disabled", "当前用户不可用。"),
    };
  }

  const scopes = normalizeScopes(apiToken.scopes, []);
  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: apiError(403, "insufficient_scope", `当前令牌缺少 ${requiredScope} 权限。`),
    };
  }

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    ok: true,
    principal: {
      userId: apiToken.user.id,
      email: apiToken.user.email,
      name: apiToken.user.name,
      globalRole: apiToken.user.globalRole,
      scopes,
      tokenId: apiToken.id,
    },
  };
}
