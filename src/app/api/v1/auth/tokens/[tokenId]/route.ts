import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ tokenId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(401, "unauthorized", "请先登录后再撤销个人访问令牌。 ");
  }

  const { tokenId } = await context.params;
  const existing = await prisma.apiToken.findFirst({
    where: { id: tokenId, userId: session.user.id },
    select: { id: true, revokedAt: true },
  });

  if (!existing) {
    return apiError(404, "not_found", "个人访问令牌不存在。 ");
  }

  const token = await prisma.apiToken.update({
    where: { id: existing.id },
    data: { revokedAt: existing.revokedAt ?? new Date() },
    select: { id: true, revokedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "api_token.revoked",
      targetType: "api_token",
      targetId: token.id,
      metadata: {},
    },
  });

  return Response.json({ data: { id: token.id, revokedAt: token.revokedAt?.toISOString() ?? null } });
}
