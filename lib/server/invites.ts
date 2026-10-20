// Invite links: random codes that let anyone holding them join the group.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { InviteLink } from "../chat/types";

// ---------------------------------------------------------------------------
// Invite links: random codes that let anyone holding them join the group.
// ---------------------------------------------------------------------------

export const MIN_INVITE_EXPIRY = 5 * 60 * 1000;

export const MAX_INVITE_EXPIRY = 30 * 24 * 60 * 60 * 1000;

export const MAX_INVITE_USES = 1000;

export const INVITE_CODE = /^[A-Za-z0-9_-]{8,32}$/;

export type InviteLinkRow = {
  code: string;
  group_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked_at: string | null;
};

export function toInviteLink(row: InviteLinkRow): InviteLink {
  return {
    code: row.code,
    groupId: row.group_id,
    ...(row.created_by && { createdBy: row.created_by }),
    createdAt: Date.parse(row.created_at),
    ...(row.expires_at && { expiresAt: Date.parse(row.expires_at) }),
    ...(row.max_uses !== null && { maxUses: row.max_uses }),
    uses: row.uses,
  };
}

/** Whether a link still lets people in. */
export function isLive(row: InviteLinkRow, now = Date.now()) {
  if (row.revoked_at) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
  return row.max_uses === null || row.uses < row.max_uses;
}
