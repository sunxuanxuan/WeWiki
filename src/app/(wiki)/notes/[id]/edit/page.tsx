import { redirect } from "next/navigation";

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/notes/${id}?edit=1`);
}
