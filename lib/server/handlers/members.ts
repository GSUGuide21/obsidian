// Group members: joining and leaving, roles, mutes, kicks, bans, ownership, invites (personal and links) and group profiles.

import { randomBytes } from "node:crypto";
import type { GroupBan, MemberProfile } from "../../chat/types";
import {
  canBan,
  allows,
  canJoinGroup,
  canLeave,
  mayActOn,
  canSetRole,
  canTransfer,
  isMemberRole,
  isMuted,
} from "../../chat/types/permissions.ts";
import {
  accessByMember,
  accessOf,
  allowedIn,
  addMember,
  canAccess,
  findGroup,
  isBanned,
  MEMBERSHIP_COLUMNS,
  noAccess,
  publishMembership,
  publishRemoval,
  refreshAccess,
  roleIn,
  scheduleBanEnd,
  toMember,
  toMembership,
  type Membership,
} from "../access.ts";
import { MAX_BIO_LENGTH, MAX_NAME_LENGTH } from "../constants.ts";
import { db } from "../db.ts";
import { cleanBio, validAvatar } from "../identity.ts";
import {
  INVITE_CODE,
  isLive,
  MAX_INVITE_EXPIRY,
  MAX_INVITE_USES,
  MIN_INVITE_EXPIRY,
  toInviteLink,
  type InviteLinkRow,
} from "../invites.ts";
import { canReact, canRead } from "../limits.ts";
import { logModeration, moderation } from "../moderation.ts";
import { members, type ChatSocket } from "../state.ts";
import { publishStructure } from "../structure.ts";
import { mainChannel, postSystem } from "../system.ts";
import { toUser, usersByIds } from "../users.ts";
import { cleanName, futureTime, num, optionalText } from "../validation.ts";

export function registerMembersHandlers(socket: ChatSocket) {
  socket.on("member:list", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const group = findGroup(payload?.groupId);
    if (!group || !canAccess(group, socket.data.userId) || !canRead(socket.id)) return ack([]);
    const { data, error } = await db.from("group_members").select(`member_id, ${MEMBERSHIP_COLUMNS}`)
      .eq("group_id", group.id).order("joined_at").limit(1000);
    if (error) {
      console.error("member list failed:", error.message);
      return ack([]);
    }
    await usersByIds(data.map((row) => row.member_id));
    ack(data.flatMap((row) => {
      const member = members.get(row.member_id);
      return member ? [toMember(member, toMembership(row))] : [];
    }));
  });

  socket.on("member:join", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const group = findGroup(payload?.groupId);
    const access = accessByMember.get(userId) ?? noAccess;
    if (group && access.groups.has(group.id)) return ack({ ok: true });
    const banned = Boolean(group) && isBanned(access, group!.id);
    if (!group || !canJoinGroup(group.visibility, { banned, invited: access.invites.has(group.id) })) {
      // Private groups you weren't invited to don't exist, as far as you can tell.
      return ack({ ok: false, error: banned ? "You're banned from this group." : "That group no longer exists." });
    }
    const error = await addMember(group.id, userId);
    if (error) {
      console.error("group join failed:", error.message);
      return ack({ ok: false, error: "Couldn't join the group. Try again." });
    }
    ack({ ok: true });
    // Only explicit joins are announced; posting in a public group joins it quietly.
    await postSystem(mainChannel(group.id), userId, { type: "member_join" });
  });

  socket.on("member:leave", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const group = findGroup(payload?.groupId);
    const membership = group && accessByMember.get(userId)?.groups.get(group.id);
    if (!group || !membership) return ack({ ok: true }); // not in it
    if (group.kind === "dm" && (group.members?.length ?? 0) <= 2) {
      return ack({ ok: false, error: "You can't leave a one-on-one conversation." });
    }
    if (!canLeave(membership.role)) return ack({ ok: false, error: "Transfer ownership to someone else before leaving." });
    // Leaving would clear the mute (rejoining starts fresh).
    if (isMuted(membership)) return ack({ ok: false, error: "You can't leave a group while you're muted." });
    const { error } = await db.from("group_members").delete().eq("group_id", group.id).eq("member_id", userId);
    if (error) {
      console.error("group leave failed:", error.message);
      return ack({ ok: false, error: "Couldn't leave the group. Try again." });
    }
    publishRemoval(group.id, userId);
    ack({ ok: true });
    await postSystem(mainChannel(group.id), userId, { type: "member_leave" });
    // A group DM is named after who's in it.
    if (group.kind === "dm") await publishStructure();
  });

  socket.on("member:invite", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const m = await moderation(socket, payload);
    if (typeof m === "string") return ack({ ok: false, error: m });
    if (!allows(m.standing, "MEMBER:INVITE")) return ack({ ok: false, error: "Only moderators and up can invite people." });
    if (m.targetMembership) return ack({ ok: true }); // already in
    if (isBanned(m.targetAccess, m.group.id)) return ack({ ok: false, error: "That person is banned from this group." });
    const alreadyInvited = m.targetAccess.invites.has(m.group.id);

    const { error } = await db.from("group_invites")
      .upsert({ group_id: m.group.id, member_id: m.targetId, invited_by: m.userId }, { ignoreDuplicates: true });
    if (error) {
      console.error("invite failed:", error.message);
      return ack({ ok: false, error: "Couldn't send the invite. Try again." });
    }
    m.targetAccess.invites.add(m.group.id);
    refreshAccess(m.targetId); // a private group now shows up for them, ready to join
    ack({ ok: true });
    if (!alreadyInvited) await logModeration(m.group.id, m.userId, m.targetId, { action: "member_invite" });
  });

  socket.on("member:invites", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const group = findGroup(payload?.groupId);
    if (!userId || !group || !canAccess(group, userId) || !canRead(socket.id)) return ack([]);
    if (!allowedIn(group.id, userId, "MEMBER:INVITE")) return ack([]);
    const { data, error } = await db.from("group_invites").select("member_id")
      .eq("group_id", group.id).order("created_at").limit(500);
    if (error) {
      console.error("invite list failed:", error.message);
      return ack([]);
    }
    ack(await usersByIds(data.map((row) => row.member_id)));
  });

  socket.on("member:uninvite", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const group = findGroup(payload?.groupId);
    const targetId = typeof payload?.userId === "string" ? payload.userId : "";
    if (!group || !targetId) return ack({ ok: true }); // nothing to withdraw
    // Declining your own invite needs no role; revoking someone else's does.
    if (targetId !== userId && (!canAccess(group, userId) || !allowedIn(group.id, userId, "MEMBER:INVITE"))) {
      return ack({ ok: false, error: "Only moderators and up can revoke invites." });
    }
    const { data: withdrawn, error } = await db.from("group_invites").delete()
      .eq("group_id", group.id).eq("member_id", targetId).select("member_id");
    if (error) {
      console.error("uninvite failed:", error.message);
      return ack({ ok: false, error: "Couldn't withdraw the invite. Try again." });
    }
    accessByMember.get(targetId)?.invites.delete(group.id);
    refreshAccess(targetId); // the private group disappears from their sidebar
    ack({ ok: true });
    // Declining your own invite isn't moderation.
    if (targetId !== userId && withdrawn?.length) {
      await logModeration(group.id, userId, targetId, { action: "invite_revoke" });
    }
  });

  socket.on("member:update", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const m = await moderation(socket, payload);
    if (typeof m === "string") return ack({ ok: false, error: m });
    // Clients can send anything; ownership only moves through member:transfer.
    const role: unknown = payload?.role;
    if (!isMemberRole(role) || role === "owner") return ack({ ok: false, error: "Pick a role." });
    if (!m.targetMembership) return ack({ ok: false, error: "They're not in this group." });
    if (!canSetRole(m.role, m.targetRole, role)) return ack({ ok: false, error: "You can't give them that role." });

    const { error } = await db.from("group_members").update({ role }).eq("group_id", m.group.id).eq("member_id", m.targetId);
    if (error) {
      console.error("role update failed:", error.message);
      return ack({ ok: false, error: "Couldn't change their role. Try again." });
    }
    publishMembership(m.group.id, m.targetId, { ...m.targetMembership, role });
    ack({ ok: true });
    if (role !== m.targetMembership.role) {
      await logModeration(m.group.id, m.userId, m.targetId, { action: "member_role", from: m.targetMembership.role, to: role });
      await postSystem(mainChannel(m.group.id), m.userId, { type: "member_role", memberId: m.targetId, role });
    }
  });

  socket.on("member:mute", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const m = await moderation(socket, payload);
    if (typeof m === "string") return ack({ ok: false, error: m });
    const until = payload?.until === null ? null : futureTime(payload?.until);
    if (until === undefined) return ack({ ok: false, error: "Pick a time in the future." });
    if (!m.targetMembership) return ack({ ok: false, error: "They're not in this group." });
    if (!mayActOn(m.standing, m.targetStanding, "MEMBER:MUTE")) return ack({ ok: false, error: "You can't mute them." });

    const { error } = await db.from("group_members")
      .update({ muted_until: until ? new Date(until).toISOString() : null })
      .eq("group_id", m.group.id).eq("member_id", m.targetId);
    if (error) {
      console.error("mute failed:", error.message);
      return ack({ ok: false, error: "Couldn't update the mute. Try again." });
    }
    const previousUntil = m.targetMembership.mutedUntil;
    const next: Membership = { ...m.targetMembership };
    if (until) next.mutedUntil = until;
    else delete next.mutedUntil;
    publishMembership(m.group.id, m.targetId, next);
    ack({ ok: true });
    await logModeration(m.group.id, m.userId, m.targetId, until
      ? { action: "member_mute", until, ...(previousUntil && { previousUntil }) }
      : { action: "member_unmute", ...(previousUntil && { previousUntil }) });
  });

  socket.on("member:kick", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const m = await moderation(socket, payload);
    if (typeof m === "string") return ack({ ok: false, error: m });
    if (!m.targetMembership) return ack({ ok: true }); // not in it
    if (!mayActOn(m.standing, m.targetStanding, "MEMBER:KICK")) return ack({ ok: false, error: "You can't remove them." });

    const { error } = await db.from("group_members").delete().eq("group_id", m.group.id).eq("member_id", m.targetId);
    if (error) {
      console.error("kick failed:", error.message);
      return ack({ ok: false, error: "Couldn't remove them. Try again." });
    }
    publishRemoval(m.group.id, m.targetId);
    ack({ ok: true });
    await logModeration(m.group.id, m.userId, m.targetId, { action: "member_kick", role: m.targetMembership.role });
    await postSystem(mainChannel(m.group.id), m.userId, { type: "member_kick", memberId: m.targetId });
  });

  socket.on("member:ban", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const m = await moderation(socket, payload);
    if (typeof m === "string") return ack({ ok: false, error: m });
    if (!canBan(m.role, m.targetRole)) return ack({ ok: false, error: "You can't ban them." });
    const reason = optionalText(payload?.reason, 200);
    if (reason === null) return ack({ ok: false, error: "Ban reasons are limited to 200 characters." });
    const until = payload?.until === undefined ? null : futureTime(payload.until);
    if (until === undefined) return ack({ ok: false, error: "Pick a time in the future." });

    const { error } = await db.from("group_bans").upsert({
      group_id: m.group.id,
      member_id: m.targetId,
      banned_by: m.userId,
      reason: reason ?? null,
      until: until ? new Date(until).toISOString() : null,
    });
    if (error) {
      console.error("ban failed:", error.message);
      return ack({ ok: false, error: "Couldn't ban them. Try again." });
    }
    await Promise.all([
      db.from("group_members").delete().eq("group_id", m.group.id).eq("member_id", m.targetId),
      db.from("group_invites").delete().eq("group_id", m.group.id).eq("member_id", m.targetId),
    ]);
    m.targetAccess.bans.set(m.group.id, until);
    m.targetAccess.invites.delete(m.group.id);
    scheduleBanEnd(m.group.id, m.targetId, until);
    publishRemoval(m.group.id, m.targetId);
    ack({ ok: true });
    await logModeration(m.group.id, m.userId, m.targetId, {
      action: "member_ban",
      ...(m.targetMembership && { role: m.targetMembership.role }),
      ...(reason && { reason }),
      ...(until && { until }),
    });
    // The reason and length stay in the ban list; the notice only says who and by whom.
    await postSystem(mainChannel(m.group.id), m.userId, { type: "member_ban", memberId: m.targetId });
  });

  socket.on("member:transfer", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const m = await moderation(socket, payload);
    if (typeof m === "string") return ack({ ok: false, error: m });
    if (!canTransfer(m.role, m.userId, m.targetId)) return ack({ ok: false, error: "Only the owner can transfer ownership." });
    if (!m.targetMembership) return ack({ ok: false, error: "They need to join the group first." });

    const { data, error } = await db.rpc("transfer_group_owner", { p_group: m.group.id, p_from: m.userId, p_to: m.targetId });
    if (error || data !== true) {
      if (error) console.error("ownership transfer failed:", error.message);
      return ack({ ok: false, error: "Couldn't transfer ownership. Try again." });
    }
    const own = accessByMember.get(m.userId)!.groups.get(m.group.id)!;
    publishMembership(m.group.id, m.userId, { ...own, role: "admin" });
    publishMembership(m.group.id, m.targetId, { ...m.targetMembership, role: "owner" });
    ack({ ok: true });
    await logModeration(m.group.id, m.userId, m.targetId, { action: "owner_transfer" });
    // One notice covers both sides: the old owner (the author) is now an admin.
    await postSystem(mainChannel(m.group.id), m.userId, { type: "member_role", memberId: m.targetId, role: "owner" });
  });

  socket.on("member:bans", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const group = findGroup(payload?.groupId);
    if (!userId || !group || !canAccess(group, userId) || !canRead(socket.id)) return ack([]);
    if (!canBan(roleIn(group.id, userId) ?? "member", "member")) return ack([]);
    const { data, error } = await db.from("group_bans").select("member_id, banned_by, reason, until, created_at")
      .eq("group_id", group.id).or(`until.is.null,until.gt."${new Date().toISOString()}"`)
      .order("created_at", { ascending: false }).limit(500);
    if (error) {
      console.error("ban list failed:", error.message);
      return ack([]);
    }
    await usersByIds(data.map((row) => row.member_id));
    ack(data.flatMap((row): GroupBan[] => {
      const member = members.get(row.member_id);
      if (!member) return [];
      return [{
        user: toUser(member),
        at: Date.parse(row.created_at),
        ...(row.reason && { reason: row.reason }),
        ...(row.until && { until: Date.parse(row.until) }),
        ...(row.banned_by && { by: row.banned_by }),
      }];
    }));
  });

  socket.on("member:unban", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = findGroup(payload?.groupId);
    const targetId = typeof payload?.userId === "string" ? payload.userId : "";
    if (!group || !canAccess(group, userId)) return ack({ ok: false, error: "That group no longer exists." });
    if (!canBan(roleIn(group.id, userId) ?? "member", "member")) {
      return ack({ ok: false, error: "Only admins and up can lift bans." });
    }
    // Deleted rows come back, so the log can say which ban was lifted.
    const { data: lifted, error } = await db.from("group_bans").delete()
      .eq("group_id", group.id).eq("member_id", targetId).select("reason, until, created_at");
    if (error) {
      console.error("unban failed:", error.message);
      return ack({ ok: false, error: "Couldn't lift the ban. Try again." });
    }
    accessByMember.get(targetId)?.bans.delete(group.id);
    scheduleBanEnd(group.id, targetId, null);
    refreshAccess(targetId); // a public group reappears for them right away
    ack({ ok: true });
    const ban = lifted?.[0];
    if (ban) {
      await logModeration(group.id, userId, targetId, {
        action: "member_unban",
        ...(ban.reason && { reason: ban.reason }),
        ...(ban.until && { until: Date.parse(ban.until) }),
        bannedAt: Date.parse(ban.created_at),
      });
    }
  });

  socket.on("invite:create", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = findGroup(payload?.groupId);
    if (!group || group.kind === "dm" || !canAccess(group, userId)) return ack({ ok: false, error: "That group no longer exists." });
    if (!allowedIn(group.id, userId, "MEMBER:INVITE")) return ack({ ok: false, error: "Only moderators and up can make invite links." });
    const expiresIn = payload.expiresIn === undefined ? undefined : num(payload.expiresIn);
    if (expiresIn !== undefined && (expiresIn < MIN_INVITE_EXPIRY || expiresIn > MAX_INVITE_EXPIRY)) {
      return ack({ ok: false, error: "Links can last from 5 minutes to 30 days, or forever." });
    }
    const maxUses = payload.maxUses === undefined ? undefined : payload.maxUses;
    if (maxUses !== undefined && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_INVITE_USES)) {
      return ack({ ok: false, error: `Links can be used 1–${MAX_INVITE_USES} times, or without a limit.` });
    }
    const { data, error } = await db.from("group_invite_links").insert({
      code: randomBytes(9).toString("base64url"),
      group_id: group.id,
      created_by: userId,
      ...(expiresIn !== undefined && { expires_at: new Date(Date.now() + expiresIn).toISOString() }),
      ...(maxUses !== undefined && { max_uses: maxUses }),
    }).select("*").single();
    if (error || !data) {
      console.error("invite link insert failed:", error?.message);
      return ack({ ok: false, error: "Couldn't make the link. Try again." });
    }
    const link = toInviteLink(data as InviteLinkRow);
    ack({ ok: true, link });
    await logModeration(group.id, userId, null, {
      action: "invite_link_create",
      code: link.code,
      ...(link.expiresAt && { expiresAt: link.expiresAt }),
      ...(link.maxUses && { maxUses: link.maxUses }),
    });
  });

  socket.on("invite:list", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const group = findGroup(payload?.groupId);
    if (!userId || !group || !canAccess(group, userId) || !canRead(socket.id)) return ack([]);
    if (!allowedIn(group.id, userId, "MEMBER:INVITE")) return ack([]);
    const { data, error } = await db.from("group_invite_links").select("*")
      .eq("group_id", group.id).is("revoked_at", null).order("created_at", { ascending: false }).limit(100);
    if (error) {
      console.error("invite link list failed:", error.message);
      return ack([]);
    }
    ack((data as InviteLinkRow[]).filter((row) => isLive(row)).map(toInviteLink));
  });

  socket.on("invite:revoke", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const code = typeof payload?.code === "string" && INVITE_CODE.test(payload.code) ? payload.code : "";
    const { data: row } = code
      ? await db.from("group_invite_links").select("*").eq("code", code).maybeSingle()
      : { data: null };
    const link = row as InviteLinkRow | null;
    if (!link || link.revoked_at) return ack({ ok: true }); // already gone
    const group = findGroup(link.group_id);
    if (!group || !canAccess(group, userId) || !allowedIn(group.id, userId, "MEMBER:INVITE")) {
      return ack({ ok: false, error: "Only moderators and up can revoke invite links." });
    }
    const { error } = await db.from("group_invite_links").update({ revoked_at: new Date().toISOString() }).eq("code", code);
    if (error) {
      console.error("invite link revoke failed:", error.message);
      return ack({ ok: false, error: "Couldn't revoke the link. Try again." });
    }
    ack({ ok: true });
    await logModeration(group.id, userId, null, { action: "invite_link_revoke", code, uses: link.uses });
  });

  socket.on("invite:preview", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const code = typeof payload?.code === "string" && INVITE_CODE.test(payload.code) ? payload.code : "";
    if (!userId || !code || !canRead(socket.id)) return ack(null);
    const { data } = await db.from("group_invite_links").select("*").eq("code", code).maybeSingle();
    const link = data as InviteLinkRow | null;
    const group = link && isLive(link) ? findGroup(link.group_id) : undefined;
    if (!group) return ack(null);
    const { count } = await db.from("group_members").select("member_id", { count: "exact", head: true }).eq("group_id", group.id);
    ack({
      code,
      group: {
        id: group.id,
        name: group.name,
        color: group.color,
        visibility: group.visibility ?? "public",
        ...(group.description && { description: group.description }),
      },
      ...(count !== null && { memberCount: count }),
      joined: Boolean(accessByMember.get(userId)?.groups.has(group.id)),
    });
  });

  socket.on("invite:redeem", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const code = typeof payload?.code === "string" && INVITE_CODE.test(payload.code) ? payload.code : "";
    const expired = "This invite link has expired or is no longer valid.";
    const { data } = code ? await db.from("group_invite_links").select("*").eq("code", code).maybeSingle() : { data: null };
    const link = data as InviteLinkRow | null;
    const group = link ? findGroup(link.group_id) : undefined;
    if (!link || !group) return ack({ ok: false, error: expired });
    const access = await accessOf(userId);
    // Already in: nothing to use up.
    if (access.groups.has(group.id)) return ack({ ok: true, groupId: group.id, subgroupId: mainChannel(group.id) });
    if (isBanned(access, group.id)) return ack({ ok: false, error: "You're banned from this group." });
    // Counted atomically, so the last use can't be taken twice.
    const { data: usedFor, error } = await db.rpc("use_invite_link", { p_code: code });
    if (error) {
      console.error("invite link use failed:", error.message);
      return ack({ ok: false, error: "Couldn't join the group. Try again." });
    }
    if (usedFor !== group.id) return ack({ ok: false, error: expired });
    const joinError = await addMember(group.id, userId);
    if (joinError) {
      console.error("join by link failed:", joinError.message);
      return ack({ ok: false, error: "Couldn't join the group. Try again." });
    }
    ack({ ok: true, groupId: group.id, subgroupId: mainChannel(group.id) });
    await postSystem(mainChannel(group.id), userId, { type: "member_join" });
  });

  socket.on("member:profile", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = findGroup(payload?.groupId);
    const membership = group && accessByMember.get(userId)?.groups.get(group.id);
    if (!group || !membership) return ack({ ok: false, error: "Join the group first." });

    const input: Record<string, unknown> = payload?.profile && typeof payload.profile === "object" ? payload.profile : {};
    const displayName = input.displayName === undefined || input.displayName === "" ? null : cleanName(input.displayName);
    if (displayName === "") return ack({ ok: false, error: `Display names must be 1–${MAX_NAME_LENGTH} characters.` });
    const bio = input.bio === undefined || input.bio === "" ? null : (cleanBio(input.bio) ?? "");
    if (bio === "") return ack({ ok: false, error: `Bios are limited to ${MAX_BIO_LENGTH} characters.` });
    const avatarUrl = input.avatarUrl === undefined || input.avatarUrl === "" ? null : (validAvatar(input.avatarUrl) ?? "");
    if (avatarUrl === "") return ack({ ok: false, error: "That photo can't be used." });

    const { error } = await db.from("group_members")
      .update({ display_name: displayName, avatar_url: avatarUrl, bio })
      .eq("group_id", group.id).eq("member_id", userId);
    if (error) {
      console.error("group profile update failed:", error.message);
      return ack({ ok: false, error: "Couldn't save your profile. Try again." });
    }
    const profile: MemberProfile = {
      ...(displayName && { displayName }),
      ...(avatarUrl && { avatarUrl }),
      ...(bio && { bio }),
    };
    const next: Membership = { ...membership };
    if (Object.keys(profile).length > 0) next.profile = profile;
    else delete next.profile;
    publishMembership(group.id, userId, next);
    ack({ ok: true });
  });
}
