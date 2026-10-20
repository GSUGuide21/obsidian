// Sessions: joining, what you're looking at, your status and settings, push, typing, deleting your account, leaving.

import {
  accessByMember,
  accessOf,
  canAccess,
  channelFor,
  findGroup,
  groupRoom,
  isNotificationLevel,
  listedGroups,
  loadAccess,
  socketsOf,
  syncRooms,
} from "../access.ts";
import { calls, leaveCall } from "../calls.ts";
import { ID_PATTERN, MAX_NAME_LENGTH, MAX_STATUS_TEXT_LENGTH } from "../constants.ts";
import { db } from "../db.ts";
import { discoverChanged } from "../discover.ts";
import { tenorKey } from "../gifs.ts";
import { cleanBio, colorFor, validAvatar, validColor, verifyAccessToken } from "../identity.ts";
import { canJoin, canReact, canType } from "../limits.ts";
import { EMOJI } from "../messages.ts";
import { reportCounts } from "../moderation.ts";
import { pushEnabled } from "../notifications.ts";
import { readSnapshot } from "../reads.ts";
import { io, release } from "../sockets.ts";
import {
  channels,
  connections,
  groups,
  idleSockets,
  isPresence,
  latest,
  members,
  settings,
  STATUS_COLUMNS,
  toStatusRow,
  type ChatSocket,
  type MemberRow,
  type StatusRow,
} from "../state.ts";
import { publishStructure } from "../structure.ts";
import { savedIds } from "./saved.ts";
import { isIdle, publishUser, scheduleStatusEnd, toUser, usersByIds } from "../users.ts";
import { cleanName, futureTime, optionalText, url } from "../validation.ts";

export function registerSessionHandlers(socket: ChatSocket) {
  socket.on("session:join", async (payload, ack) => {
    if (typeof ack !== "function") return;
    // Per connection, not per IP: behind a proxy everyone shares one address.
    if (!canJoin(socket.id)) return ack({ error: "Too many attempts. Wait a moment and reload." });

    // `role` is only ever set in the database, and the status by "status:set",
    // so they're read back below rather than sent.
    let row: Omit<MemberRow, "role" | keyof StatusRow>;
    let authUserId: string | null = null;

    if (typeof payload?.accessToken === "string") {
      const verified = await verifyAccessToken(payload.accessToken);
      if (!verified) {
        if (!socket.disconnected) ack({ error: "Your sign-in has expired. Sign in again." });
        return;
      }
      authUserId = verified.userId;
      row = {
        id: verified.userId,
        kind: "user",
        name: verified.name,
        color: verified.color ?? colorFor(verified.userId),
        avatar_url: verified.avatarUrl ?? null,
        bio: verified.bio ?? null,
        poster_url: verified.posterUrl ?? null,
      };
    } else {
      if (!settings.guestsAllowed) return ack({ error: "Guests can't join right now. Sign in with Google instead." });
      // Guests pick their own random id, so it's namespaced and can never
      // collide with (or impersonate) a signed-in account's id.
      const rawId = typeof payload?.userId === "string" ? payload.userId : "";
      if (!ID_PATTERN.test(rawId)) {
        return ack({ error: "Your session is invalid. Sign out and join again." });
      }
      const name = cleanName(payload?.name);
      if (!name) return ack({ error: `Display names must be 1–${MAX_NAME_LENGTH} characters.` });
      const id = `guest-${rawId}`;
      row = {
        id,
        kind: "guest",
        name,
        color: validColor(payload?.color) ?? colorFor(id),
        avatar_url: validAvatar(payload?.avatarUrl) ?? null,
        bio: cleanBio(payload?.bio) ?? null,
        // Guests can't upload, so they have no cover photo.
        poster_url: null,
      };
    }

    // Identity first (the profile row references it), then the profile.
    const { color, avatar_url, bio, poster_url, ...identity } = row;
    const { data: saved, error } = await db.from("members").upsert({
      ...identity,
      auth_user_id: authUserId,
      last_seen_at: new Date().toISOString(),
    }).select("role, banned_at, ban_reason").single();
    // It may have disconnected while we waited; joining now would leave a
    // phantom "online" user that never gets released.
    if (socket.disconnected) return;
    if (error || !saved) {
      console.error("member upsert failed:", error?.message);
      return ack({ error: "Couldn't reach the chat database. Try again in a moment." });
    }
    if (saved.banned_at) {
      const reason = saved.ban_reason ? ` Reason: ${saved.ban_reason}` : "";
      return ack({ error: `You're banned from ${settings.name}.${reason}` });
    }
    const { data: profile, error: profileError } = await db.from("profiles").upsert({
      member_id: row.id,
      color,
      avatar_url,
      bio,
      poster_url,
      updated_at: new Date().toISOString(),
    }).select(STATUS_COLUMNS).single();
    if (socket.disconnected) return;
    if (profileError) {
      console.error("profile upsert failed:", profileError.message);
      return ack({ error: "Couldn't reach the chat database. Try again in a moment." });
    }
    const member: MemberRow = {
      ...row,
      ...toStatusRow(profile as Partial<StatusRow> | null),
      role: saved.role === "admin" ? "admin" : "member",
    };
    members.set(member.id, member);
    scheduleStatusEnd(member);
    try {
      await loadAccess(member.id);
    } catch (accessError) {
      console.error(accessError instanceof Error ? accessError.message : accessError);
      return ack({ error: "Couldn't reach the chat database. Try again in a moment." });
    }
    if (socket.disconnected) return;

    if (socket.data.userId !== member.id) {
      release(socket);
      socket.data.userId = member.id;
      connections.set(member.id, (connections.get(member.id) ?? 0) + 1);
      discoverChanged();
    }
    syncRooms(socket);

    const self = toUser(member);
    io.emit("user:update", self);
    // Online members plus signed-in members (offline guests aren't listed).
    const listed = [...members.values()].filter((m) => m.kind !== "guest" || connections.has(m.id));
    const visible = listedGroups(member.id);
    const channelIds = visible.flatMap((g) => g.subgroups.map((s) => s.id));
    const mine = visible.filter((g) => g.role).flatMap((g) => g.subgroups.map((s) => s.id));
    // People in your direct messages, so their names show even if they haven't been around lately.
    const dmPeople = await usersByIds(new Set(visible.flatMap((g) => g.members ?? [])));
    const [{ unread, lastRead, mentions }, reports, savedMessages] = await Promise.all([
      readSnapshot(member.id, channelIds, mine),
      reportCounts(member.id),
      savedIds(member.id),
    ]);
    const listedUsers = new Map(listed.map((m) => [m.id, toUser(m)]));
    for (const user of dmPeople) listedUsers.set(user.id, user);
    ack({
      self,
      settings,
      users: [...listedUsers.values()],
      groups: visible,
      latest: Object.fromEntries(channelIds.flatMap((id) => (latest.has(id) ? [[id, latest.get(id)!]] : []))),
      unread,
      lastRead,
      mentions,
      notifications: Object.fromEntries(accessByMember.get(member.id)?.notifications ?? []),
      readReceipts: member.read_receipts,
      gifs: Boolean(tenorKey),
      presence: member.presence,
      blocked: [...(accessByMember.get(member.id)?.blocked ?? [])],
      reports,
      saved: savedMessages,
    });
    // Ongoing calls they can see (and any ringing for them).
    for (const call of calls.values()) {
      const group = findGroup(call.groupId);
      if (group && canAccess(group, member.id)) socket.emit("call:update", call);
    }
  });

  socket.on("view", (payload) => {
    const subgroupId = payload?.subgroupId;
    const groupId = typeof subgroupId === "string" ? channelFor(subgroupId, socket.data.userId)?.groupId : undefined;
    if (socket.data.viewing === groupId) return;
    socket.data.viewing = groupId;
    discoverChanged();
  });

  socket.on("status:set", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const row = userId ? members.get(userId) : undefined;
    if (!userId || !row) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const changes: Partial<StatusRow> = {};
    if (payload?.presence !== undefined) {
      if (!isPresence(payload.presence)) return ack({ ok: false, error: "Pick a status." });
      changes.presence = payload.presence;
    }
    if (payload?.text !== undefined) {
      const text = payload.text === null ? undefined : optionalText(payload.text, MAX_STATUS_TEXT_LENGTH);
      if (text === null) return ack({ ok: false, error: `Statuses are limited to ${MAX_STATUS_TEXT_LENGTH} characters.` });
      changes.status_text = text ?? null;
    }
    if (payload?.emoji !== undefined) {
      const emoji = typeof payload.emoji === "string" ? payload.emoji.trim() : "";
      if (emoji && (emoji.length > 16 || !EMOJI.test(emoji))) return ack({ ok: false, error: "Pick a single emoji." });
      changes.status_emoji = emoji || null;
    }
    if (payload?.until !== undefined) {
      const until = payload.until === null ? null : futureTime(payload.until);
      if (until === undefined) return ack({ ok: false, error: "Pick when the status clears." });
      changes.status_expires_at = until === null ? null : new Date(until).toISOString();
    }
    // A cleared custom status has nothing left to expire.
    const next = { ...row, ...changes };
    if (!next.status_text && !next.status_emoji) changes.status_expires_at = null;

    const { error } = await db.from("profiles").update(changes).eq("member_id", userId);
    if (error) {
      console.error("status update failed:", error.message);
      return ack({ ok: false, error: "Couldn't save your status. Try again." });
    }
    Object.assign(row, changes);
    scheduleStatusEnd(row);
    publishUser(userId);
    ack({ ok: true });
  });

  socket.on("privacy:set", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const row = userId ? members.get(userId) : undefined;
    if (!userId || !row) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    if (typeof payload?.readReceipts !== "boolean") return ack({ ok: false, error: "Pick a setting." });
    const { error } = await db.from("profiles").update({ read_receipts: payload.readReceipts }).eq("member_id", userId);
    if (error) {
      console.error("privacy update failed:", error.message);
      return ack({ ok: false, error: "Couldn't save the setting. Try again." });
    }
    row.read_receipts = payload.readReceipts;
    ack({ ok: true });
  });

  socket.on("presence:idle", (payload) => {
    const userId = socket.data.userId;
    const idle = payload?.idle === true;
    if (!userId || Boolean(socket.data.idle) === idle) return;
    const wasIdle = isIdle(userId);
    socket.data.idle = idle;
    const count = (idleSockets.get(userId) ?? 0) + (idle ? 1 : -1);
    if (count > 0) idleSockets.set(userId, count);
    else idleSockets.delete(userId);
    if (isIdle(userId) !== wasIdle) publishUser(userId);
  });

  socket.on("notifications:set", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const targetId = typeof payload?.targetId === "string" ? payload.targetId : "";
    const group = findGroup(targetId) ?? findGroup(channels.get(targetId)?.groupId);
    if (!group || !canAccess(group, userId)) return ack({ ok: false, error: "That group or channel no longer exists." });
    const level = payload.level;
    if (level !== null && !isNotificationLevel(level)) return ack({ ok: false, error: "Pick a notification setting." });

    const { error } = level === null
      ? await db.from("notification_settings").delete().eq("member_id", userId).eq("target_id", targetId)
      : await db.from("notification_settings")
        .upsert({ member_id: userId, target_id: targetId, level, updated_at: new Date().toISOString() });
    if (error) {
      console.error("notification setting failed:", error.message);
      return ack({ ok: false, error: "Couldn't save the setting. Try again." });
    }
    const access = await accessOf(userId);
    if (level === null) access.notifications.delete(targetId);
    else access.notifications.set(targetId, level);
    ack({ ok: true });
  });

  socket.on("push:subscribe", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId || members.get(userId)?.kind !== "user") return ack({ ok: false, error: "Sign in with Google to get push notifications." });
    if (!pushEnabled) return ack({ ok: false, error: "Push notifications aren't set up on this server." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const endpoint = url(payload?.endpoint);
    const p256dh = typeof payload?.keys?.p256dh === "string" ? payload.keys.p256dh : "";
    const auth = typeof payload?.keys?.auth === "string" ? payload.keys.auth : "";
    if (!endpoint?.startsWith("https://") || !p256dh || p256dh.length > 256 || !auth || auth.length > 256) {
      return ack({ ok: false, error: "Your browser sent an invalid subscription." });
    }
    // An endpoint belongs to one browser: whoever subscribes it last owns it.
    const { error } = await db.from("push_subscriptions")
      .upsert({ endpoint, member_id: userId, p256dh, auth, updated_at: new Date().toISOString() });
    if (error) {
      console.error("push subscribe failed:", error.message);
      return ack({ ok: false, error: "Couldn't turn on push notifications. Try again." });
    }
    ack({ ok: true });
  });

  socket.on("push:unsubscribe", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const endpoint = typeof payload?.endpoint === "string" ? payload.endpoint : "";
    if (!userId || !endpoint) return ack({ ok: true });
    const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("member_id", userId);
    if (error) {
      console.error("push unsubscribe failed:", error.message);
      return ack({ ok: false, error: "Couldn't turn off push notifications. Try again." });
    }
    ack({ ok: true });
  });

  socket.on("account:delete", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const row = userId ? members.get(userId) : undefined;
    if (!userId || row?.kind !== "user") return ack({ ok: false, error: "Only signed-in accounts can be deleted." });
    if (payload?.confirm !== "delete") return ack({ ok: false, error: "Type delete to confirm." });
    const access = await accessOf(userId);
    const owned = groups.filter((g) => g.kind !== "dm" && access.groups.get(g.id)?.role === "owner");
    if (owned.length > 0) {
      const names = owned.map((g) => g.name).join(", ");
      return ack({ ok: false, error: `You own ${names}. Transfer ownership or delete ${owned.length === 1 ? "it" : "them"} first.` });
    }
    // Their member row goes with the auth user (on delete cascade), and with it
    // their memberships, profile, reactions, blocks and push subscriptions;
    // their messages stay, without a name.
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) {
      console.error("account delete failed:", error.message);
      return ack({ ok: false, error: "Couldn't delete your account. Try again." });
    }
    ack({ ok: true });
    for (const s of socketsOf(userId)) s.disconnect(true);
    members.delete(userId);
    accessByMember.delete(userId);
    io.emit("user:remove", userId);
    // Direct messages are named after who's in them.
    if (groups.some((g) => g.kind === "dm" && g.members?.includes(userId))) await publishStructure();
  });

  socket.on("typing", (payload) => {
    const userId = socket.data.userId;
    const subgroupId = payload?.subgroupId;
    const channel = channelFor(subgroupId, userId);
    if (!userId || !channel || !canType(userId)) return;
    socket.to(groupRoom(channel.groupId)).emit("typing", { subgroupId: channel.id, userId, typing: payload.typing === true });
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId;
    leaveCall(socket);
    release(socket);
    discoverChanged();
    // Their other tabs may all be idle now (release announces it if this was the last).
    if (userId && connections.has(userId)) publishUser(userId);
  });
}
