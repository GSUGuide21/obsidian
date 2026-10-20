// Custom roles: making, changing, ordering and deleting a group's roles, and handing them out.

import { randomUUID } from "node:crypto";
import type { Group, GroupRole, GroupRoleDraft } from "../../chat/types";
import { canAssignRoles, canManageRoles, isRolePermission } from "../../chat/types/permissions.ts";
import { accessByMember, accessOf, canAccess, findGroup, publishMembership, roleIn, type Membership } from "../access.ts";
import { db } from "../db.ts";
import { canReact } from "../limits.ts";
import { logModeration } from "../moderation.ts";
import { members, type ChatSocket } from "../state.ts";
import { publishStructure } from "../structure.ts";
import { usersByIds } from "../users.ts";

// Mirror lib/chat/types/groups.ts.
const MAX_GROUP_ROLES = 20;
const MAX_ROLE_NAME_LENGTH = 32;
const COLOR = /^#[0-9a-f]{6}$/;

const MANAGE_ROLES_ERROR = "Only the group's owner and admins can manage roles.";

/** A valid role from what a client sent, or why it isn't one. */
function cleanRoleDraft(input: Partial<Record<keyof GroupRoleDraft, unknown>>): GroupRoleDraft | string {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > MAX_ROLE_NAME_LENGTH) return `Role names are 1–${MAX_ROLE_NAME_LENGTH} characters.`;
  const color = typeof input.color === "string" ? input.color.toLowerCase() : "";
  if (!COLOR.test(color)) return "Pick a color.";
  const permissions = Array.isArray(input.permissions) ? [...new Set(input.permissions.filter(isRolePermission))] : [];
  return { name, color, permissions };
}

/** The group (not a direct message), if they can manage its roles. */
function managedGroup(groupId: unknown, userId: string): Group | undefined {
  const group = findGroup(groupId);
  if (!group || group.kind === "dm" || !canAccess(group, userId) || !canManageRoles(roleIn(group.id, userId))) return undefined;
  return group;
}

export function registerRolesHandlers(socket: ChatSocket) {
  socket.on("role:save", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = managedGroup(payload?.groupId, userId);
    if (!group) return ack({ ok: false, error: MANAGE_ROLES_ERROR });
    const draft = cleanRoleDraft(payload);
    if (typeof draft === "string") return ack({ ok: false, error: draft });

    const roles = group.roles ?? [];
    const id = typeof payload.id === "string" ? payload.id : undefined;
    const previous = id ? roles.find((role) => role.id === id) : undefined;
    if (id && !previous) return ack({ ok: false, error: "That role no longer exists." });
    if (roles.some((role) => role.id !== id && role.name.toLowerCase() === draft.name.toLowerCase())) {
      return ack({ ok: false, error: `There's already a role called “${draft.name}”.` });
    }
    if (!id && roles.length >= MAX_GROUP_ROLES) {
      return ack({ ok: false, error: `A group can have up to ${MAX_GROUP_ROLES} roles.` });
    }

    const saved: GroupRole = { id: id ?? randomUUID(), ...draft };
    const { error } = id
      ? await db.from("group_roles").update(draft).eq("group_id", group.id).eq("id", id)
      : await db.from("group_roles").insert({ ...saved, group_id: group.id, position: roles.length });
    if (error) {
      console.error("role save failed:", error.message);
      return ack({ ok: false, error: "Couldn't save the role. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    await logModeration(group.id, userId, null, previous
      ? { action: "role_update", before: previous, after: saved }
      : { action: "role_create", role: saved });
  });

  socket.on("role:delete", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const group = managedGroup(payload?.groupId, userId);
    if (!group) return ack({ ok: false, error: MANAGE_ROLES_ERROR });
    const role = group.roles?.find((r) => r.id === payload.id);
    if (!role) return ack({ ok: true }); // already gone

    // Deletes it and takes it from everyone who held it, in one transaction.
    const { error } = await db.rpc("delete_group_role", { p_group: group.id, p_role: role.id });
    if (error) {
      console.error("role delete failed:", error.message);
      return ack({ ok: false, error: "Couldn't delete the role. Try again." });
    }
    for (const access of accessByMember.values()) {
      const membership = access.groups.get(group.id);
      if (membership?.roles?.includes(role.id)) access.groups.set(group.id, withRoles(membership, membership.roles.filter((r) => r !== role.id)));
    }
    await publishStructure();
    ack({ ok: true });
    await logModeration(group.id, userId, null, { action: "role_delete", role });
  });

  socket.on("roles:reorder", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = managedGroup(payload?.groupId, userId);
    if (!group) return ack({ ok: false, error: MANAGE_ROLES_ERROR });
    const ids = (group.roles ?? []).map((role) => role.id);
    const order = Array.isArray(payload.order) ? payload.order : [];
    if (order.length !== ids.length || !ids.every((id) => order.includes(id))) {
      return ack({ ok: false, error: "The roles changed meanwhile. Try again." });
    }
    const results = await Promise.all(
      order.map((id, position) => db.from("group_roles").update({ position }).eq("group_id", group.id).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) console.error("role reorder failed:", failed.error.message);
    await publishStructure();
    ack(failed ? { ok: false, error: "Couldn't reorder the roles. Try again." } : { ok: true });
  });

  socket.on("member:roles", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = findGroup(payload?.groupId);
    if (!group || group.kind === "dm" || !canAccess(group, userId)) return ack({ ok: false, error: "That group no longer exists." });
    const targetId = typeof payload?.userId === "string" ? payload.userId : "";
    if (!members.has(targetId)) await usersByIds([targetId]);
    if (!members.has(targetId)) return ack({ ok: false, error: "That person doesn't exist." });
    const membership = (await accessOf(targetId)).groups.get(group.id);
    if (!membership) return ack({ ok: false, error: "They're not in this group." });
    if (!canAssignRoles(roleIn(group.id, userId), roleIn(group.id, targetId) ?? "member", targetId === userId)) {
      return ack({ ok: false, error: "You can't change their roles." });
    }

    // Only this group's roles, in the group's order.
    const wanted = new Set(Array.isArray(payload.roles) ? payload.roles : []);
    const roles = (group.roles ?? []).filter((role) => wanted.has(role.id));
    const next = roles.map((role) => role.id);
    const before = membership.roles ?? [];
    const { error } = await db.from("group_members").update({ roles: next }).eq("group_id", group.id).eq("member_id", targetId);
    if (error) {
      console.error("member roles update failed:", error.message);
      return ack({ ok: false, error: "Couldn't change their roles. Try again." });
    }
    publishMembership(group.id, targetId, withRoles(membership, next));
    ack({ ok: true });
    const nameOf = (id: string) => group.roles?.find((role) => role.id === id)?.name ?? "a deleted role";
    const added = next.filter((id) => !before.includes(id)).map(nameOf);
    const removed = before.filter((id) => !next.includes(id)).map(nameOf);
    if (added.length || removed.length) {
      await logModeration(group.id, userId, targetId, { action: "member_roles", added, removed });
    }
  });
}

/** The membership holding exactly these custom roles. */
function withRoles(membership: Membership, roles: string[]): Membership {
  const next = { ...membership };
  if (roles.length) next.roles = roles;
  else delete next.roles;
  return next;
}
