import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getHomeDocumentPage, InvalidDocumentCursorError } from "@/lib/wiki-home-documents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get("cursor");
  const spaceId = searchParams.get("spaceId")?.trim() || null;
  const rawParentId = searchParams.get("parentId");
  const query = searchParams.get("query")?.trim() || null;

  if (query && query.length > 200) {
    return NextResponse.json({ message: "搜索关键词不能超过 200 个字符。" }, { status: 400 });
  }

  if (rawParentId !== null && !spaceId) {
    return NextResponse.json({ message: "按目录查询文档时必须指定空间。" }, { status: 400 });
  }

  const scope = !query && spaceId
    ? { spaceId, parentId: !rawParentId || rawParentId === "root" ? null : rawParentId.trim() }
    : undefined;

  try {
    const page = await getHomeDocumentPage(session.user.id, cursor, scope, query);
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof InvalidDocumentCursorError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Failed to load more wiki documents", error);
    return NextResponse.json({ message: "加载历史文档失败，请稍后重试。" }, { status: 500 });
  }
}
