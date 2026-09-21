import { GlobalRole, NoteRole, SpaceRole, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export type PermissionAction = "read" | "write" | "delete" | "share";

const NOTE_ROLE_WEIGHT: Record<NoteRole, number> = {
  [NoteRole.VIEWER]: 1,
  [NoteRole.EDITOR]: 2,
  [NoteRole.ADMIN]: 3,
  [NoteRole.OWNER]: 4,
};

const SPACE_ROLE_WEIGHT: Record<SpaceRole, number> = {
  [SpaceRole.VIEWER]: 1,
  [SpaceRole.EDITOR]: 2,
  [SpaceRole.ADMIN]: 3,
  [SpaceRole.OWNER]: 4,
};

function requiredWeight(action: PermissionAction) {
  switch (action) {
    case "read":
      return 1;
    case "write":
      return 2;
    case "delete":
    case "share":
      return 3;
  }
}

export async function canAccessNote(params: {
  userId: string;
  noteId: string;
  action: PermissionAction;
}) {
  const { userId, noteId, action } = params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRole: true, status: true },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    return false;
  }

  if (user.globalRole === GlobalRole.ADMIN || user.globalRole === GlobalRole.SUPER_ADMIN) {
    return true;
  }

  const note = await prisma.note.findFirst({
    where: { id: noteId, deletedAt: null },
    select: {
      ownerId: true,
      spaceId: true,
      permissions: {
        where: { userId },
        select: { role: true },
      },
      space: {
        select: {
          ownerId: true,
          members: {
            where: { userId },
            select: { role: true },
          },
        },
      },
    },
  });

  if (!note) {
    return false;
  }

  if (note.ownerId === userId || note.space.ownerId === userId) {
    return true;
  }

  const needed = requiredWeight(action);
  const noteRole = note.permissions[0]?.role;
  const spaceRole = note.space.members[0]?.role;

  return (
    (noteRole ? NOTE_ROLE_WEIGHT[noteRole] >= needed : false) ||
    (spaceRole ? SPACE_ROLE_WEIGHT[spaceRole] >= needed : false)
  );
}
