// Groups and channels: creating, editing, ordering and deleting them, direct messages, discover, wiki pages, custom emoji and the word filter.

import { cleanBlockedWords, isSlowMode } from "../../chat/safety.ts";
import type { ModerationRecord } from "../../chat/types";
import { isEmojiName, MAX_CUSTOM_EMOJI } from "../../chat/types/groups.ts";
import { canDeleteGroup } from "../../chat/types/permissions.ts";
import {
  accessByMember,
  accessOf,
  canCreate,
  canCreateGroup,
  canEdit,
  canManage,
  CHANNEL_TYPES,
  channelFor,
  eitherBlocked,
  findGroup,
  isAdmin,
  loadAccess,
  MANAGE_CHANNELS_ERROR,
  mutedIn,
  noAccess,
  refreshAccess,
  roleIn,
  toChannel,
} from "../access.ts";
import { MAX_DM_MEMBERS, MAX_GROUP_DESCRIPTION_LENGTH, MAX_PAGE_LENGTH } from "../constants.ts";
import { db } from "../db.ts";
import { DISCOVER_ROOM, discoverPage, discoverShared } from "../discover.ts";
import { createDm, findDm } from "../dms.ts";
import { validAvatar, validHexColor } from "../identity.ts";
import { canReact, canRead, canSend } from "../limits.ts";
import { toWikiPage } from "../messages.ts";
import { changed, channelSnapshot, groupSnapshot, logModeration } from "../moderation.ts";
import { blockedWords, channels, groups, members, type ChatSocket } from "../state.ts";
import { isPermutation, nextPosition, publishStructure, writePositions } from "../structure.ts";
import { postSystem } from "../system.ts";
import { usersByIds } from "../users.ts";
import { cleanChannelName, newId, optionalText } from "../validation.ts";

export function registerGroupsHandlers(socket: ChatSocket) {
  socket.on("discover", async (_payload, ack) => {
    if (typeof ack !== "function") return;
    if (!canRead(socket.id)) return ack({ groups: [], events: [], users: [] });
    void socket.join(DISCOVER_ROOM);
    ack(await discoverPage(socket.data.userId, await discoverShared()));
  });

  socket.on("discover:leave", () => void socket.leave(DISCOVER_ROOM));

  socket.on("dm:open", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    // Guests vanish when they leave, which would strand their conversations.
    if (members.get(userId)?.kind !== "user") return ack({ ok: false, error: "Sign in with Google to send direct messages." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const raw: unknown[] = Array.isArray(payload?.userIds) ? payload.userIds : [];
    const others = [...new Set(raw.filter((id): id is string => typeof id === "string" && id !== userId))];
    if (others.length === 0) return ack({ ok: false, error: "Pick someone to message." });
    if (others.length > MAX_DM_MEMBERS - 1) {
      return ack({ ok: false, error: `Direct messages can include up to ${MAX_DM_MEMBERS - 1} other people.` });
    }
    await usersByIds(others);
    if (others.some((id) => members.get(id)?.kind !== "user")) {
      return ack({ ok: false, error: "You can only message people who are signed in." });
    }
    // Blocking works both ways for direct messages (said neutrally, so it doesn't reveal who blocked whom).
    await Promise.all(others.map((id) => accessOf(id)));
    if (others.some((id) => eitherBlocked(userId, id))) {
      return ack({ ok: false, error: "You can't start a conversation with that person." });
    }

    const participants = [userId, ...others];
    const existing = findDm(participants);
    if (existing?.subgroups[0]) return ack({ ok: true, subgroupId: existing.subgroups[0].id });
    const result = await createDm(participants);
    ack("error" in result ? { ok: false, error: result.error } : { ok: true, subgroupId: result.channelId });
  });

  socket.on("wiki:get", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    if (channelFor(channelId, socket.data.userId)?.type !== "wiki" || !canRead(socket.id)) return ack(null);
    const { data, error } = await db.from("channel_pages")
      .select("body, version, updated_at, updated_by").eq("channel_id", channelId).maybeSingle();
    if (error) {
      console.error("wiki load failed:", error.message);
      return ack(null);
    }
    // Editors are signed-in members, who are all in the join snapshot.
    ack(toWikiPage(channelId, data));
  });

  socket.on("wiki:save", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (members.get(userId)?.kind === "guest") return ack({ ok: false, error: "Sign in with Google to edit pages." });
    if (!canSend(userId)) return ack({ ok: false, error: "You're saving too quickly. Wait a moment." });

    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    const channel = channelFor(channelId, userId);
    if (channel?.type !== "wiki") return ack({ ok: false, error: "That page doesn't exist." });
    if (mutedIn(channel.groupId, userId)) return ack({ ok: false, error: "You can't edit pages while you're muted." });
    const body = typeof payload.body === "string" ? payload.body.replace(/\s+$/, "") : "";
    if (body.length > MAX_PAGE_LENGTH) {
      return ack({ ok: false, error: `Pages are limited to ${MAX_PAGE_LENGTH.toLocaleString("en-US")} characters.` });
    }
    const base = Number.isInteger(payload.baseVersion) && payload.baseVersion >= 0 ? payload.baseVersion : -1;
    if (base < 0) return ack({ ok: false, error: "Reload the page and try again." });

    const columns = "body, version, updated_at, updated_by";
    const values = { body, updated_at: new Date().toISOString(), updated_by: userId };
    // Compare-and-swap on `version`: the first save inserts, later saves only
    // apply if nobody else saved since this editor loaded the page.
    const { data, error } = base === 0
      ? await db.from("channel_pages").insert({ channel_id: channelId, ...values, version: 1 }).select(columns).maybeSingle()
      : await db.from("channel_pages").update({ ...values, version: base + 1 })
        .eq("channel_id", channelId).eq("version", base).select(columns).maybeSingle();

    if (!data) {
      if (error && error.code !== "23505") {
        console.error("wiki save failed:", error.message);
        return ack({ ok: false, error: "Couldn't save the page. Try again." });
      }
      const { data: current } = await db.from("channel_pages").select(columns).eq("channel_id", channelId).maybeSingle();
      return ack({
        ok: false,
        error: "Someone else saved this page while you were editing. Your changes weren't saved.",
        page: toWikiPage(channelId, current),
      });
    }
    const page = toWikiPage(channelId, data);
    toChannel(channelId).emit("wiki:update", page);
    ack({ ok: true, page });
  });

  socket.on("group:save", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const id = typeof payload?.id === "string" ? payload.id : undefined;
    if (id) {
      if (!canEdit(id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can change it." });
    } else if (!canCreateGroup(userId)) {
      // Guests disappear when they leave, which would strand the groups they own.
      return ack({ ok: false, error: "Sign in with Google to create groups." });
    }
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const name = optionalText(payload?.name, 64);
    if (!name) return ack({ ok: false, error: "Group names must be 1–64 characters." });
    const color = validHexColor(payload?.color);
    if (!color) return ack({ ok: false, error: "Pick a color for the group." });
    const visibility = payload?.visibility;
    if (visibility !== undefined && visibility !== "public" && visibility !== "private") {
      return ack({ ok: false, error: "Groups are either public or private." });
    }
    const description = optionalText(payload?.description, MAX_GROUP_DESCRIPTION_LENGTH);
    if (description === null) {
      return ack({ ok: false, error: `Descriptions are limited to ${MAX_GROUP_DESCRIPTION_LENGTH} characters.` });
    }
    // Absent leaves it as it is; blank clears it.
    const descriptionChange = payload?.description === undefined ? {} : { description: description ?? null };
    // Editing only; absent leaves them as they are.
    const words = payload?.blockedWords === undefined ? undefined : cleanBlockedWords(payload.blockedWords);
    if (words === null) {
      return ack({ ok: false, error: "Blocked words: up to 100, each up to 40 characters." });
    }

    if (id) {
      const existing = findGroup(id);
      if (!existing) return ack({ ok: false, error: "That group no longer exists." });
      const previousWords = blockedWords.get(id) ?? [];
      const before = groupSnapshot(existing, previousWords);
      const { error } = await db.from("groups")
        .update({
          name,
          color,
          ...(visibility && { visibility }),
          ...descriptionChange,
          ...(words && { blocked_words: words }),
        })
        .eq("id", id);
      if (error) {
        console.error("group update failed:", error.message);
        return ack({ ok: false, error: "Couldn't save the group. Try again." });
      }
      await publishStructure();
      ack({ ok: true, id });
      const after = groupSnapshot(
        {
          name,
          color,
          visibility: visibility ?? existing.visibility,
          description: payload?.description === undefined ? existing.description : description,
        },
        words ?? previousWords,
      );
      if (changed(before, after)) await logModeration(id, userId, null, { action: "group_update", before, after });
      return;
    }

    if (!isAdmin(userId) && !canCreate(userId)) {
      return ack({ ok: false, error: "You've created a lot of groups recently. Try again later." });
    }
    // New groups start with a #general channel, so there's somewhere to talk.
    const groupId = newId(name, 40, "group");
    const { error } = await db.from("groups")
      .insert({
        id: groupId,
        name,
        color,
        visibility: visibility ?? "public",
        ...(description && { description }),
        position: await nextPosition("groups"),
      });
    if (error) {
      console.error("group insert failed:", error.message);
      return ack({ ok: false, error: "Couldn't create the group. Try again." });
    }
    // Its creator owns it.
    const { error: ownerError } = await db.from("group_members")
      .insert({ group_id: groupId, member_id: userId, role: "owner" });
    if (ownerError) console.error("group owner insert failed:", ownerError.message);
    else accessByMember.get(userId)?.groups.set(groupId, { role: "owner", joinedAt: Date.now() });
    const channelId = newId(`${groupId}-general`, 80, "channel");
    const { error: channelError } = await db.from("channels")
      .insert({ id: channelId, group_id: groupId, name: "general", type: "text", position: 0 });
    if (channelError) console.error("default channel insert failed:", channelError.message);
    await publishStructure();
    ack({ ok: true, id: groupId, ...(!channelError && { channelId }) });
  });

  socket.on("group:delete", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const id = typeof payload?.id === "string" ? payload.id : "";
    const group = groups.find((g) => g.id === id);
    if (!group) return ack({ ok: true }); // already gone
    if (group.kind === "dm") return ack({ ok: false, error: "Direct messages can't be deleted." });
    if (!isAdmin(userId) && !canDeleteGroup(roleIn(id, userId))) {
      return ack({ ok: false, error: "Only the group's owner can delete it." });
    }
    if (channels.size - group.subgroups.length < 1) {
      return ack({ ok: false, error: "This group has the last channels. Create another group first." });
    }
    // Channels, messages, pages and read state go with it (on delete cascade).
    const { error } = await db.from("groups").delete().eq("id", id);
    if (error) {
      console.error("group delete failed:", error.message);
      return ack({ ok: false, error: "Couldn't delete the group. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
  });

  socket.on("channel:save", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const name = cleanChannelName(payload?.name);
    if (!name) return ack({ ok: false, error: "Channel names need at least one letter or number." });
    const type = typeof payload?.type === "string" && CHANNEL_TYPES.has(payload.type) ? payload.type : null;
    if (!type) return ack({ ok: false, error: "Pick a channel type." });
    const topic = optionalText(payload?.topic, 200);
    if (topic === null) return ack({ ok: false, error: "Topics are limited to 200 characters." });
    const category = optionalText(payload?.category, 40);
    if (category === null) return ack({ ok: false, error: "Category names are limited to 40 characters." });
    const slowMode = payload?.slowMode ?? 0;
    if (!isSlowMode(slowMode)) return ack({ ok: false, error: "Pick a slow mode setting." });
    const values = { name, type, topic: topic ?? null, category: category ?? null, slow_mode: slowMode };

    const id = typeof payload?.id === "string" ? payload.id : undefined;
    if (id) {
      const previous = channels.get(id);
      if (!previous) return ack({ ok: false, error: "That channel no longer exists." });
      if (!canManage(previous.groupId, userId)) return ack({ ok: false, error: MANAGE_CHANNELS_ERROR });
      const { error } = await db.from("channels").update(values).eq("id", id);
      if (error) {
        console.error("channel update failed:", error.message);
        return ack({ ok: false, error: "Couldn't save the channel. Try again." });
      }
      await publishStructure();
      ack({ ok: true, id });
      const before = channelSnapshot(previous);
      const after = channelSnapshot({ id, name, type, topic, category, slowMode });
      if (changed(before, after)) {
        await logModeration(previous.groupId, userId, null, { action: "channel_update", before, after });
      }
      if (previous.name !== name) await postSystem(id, userId!, { type: "channel_rename", from: previous.name, to: name });
      if ((previous.topic ?? undefined) !== topic) {
        await postSystem(id, userId!, { type: "channel_topic", ...(topic && { topic }) });
      }
      return;
    }

    const groupId = typeof payload?.groupId === "string" ? payload.groupId : "";
    if (!groups.some((g) => g.id === groupId)) return ack({ ok: false, error: "That group no longer exists." });
    if (!canManage(groupId, userId)) return ack({ ok: false, error: MANAGE_CHANNELS_ERROR });
    const channelId = newId(`${groupId}-${name}`, 80, "channel");
    const { error } = await db.from("channels").insert({
      id: channelId,
      group_id: groupId,
      ...values,
      position: await nextPosition("channels", groupId),
    });
    if (error) {
      console.error("channel insert failed:", error.message);
      return ack({ ok: false, error: "Couldn't create the channel. Try again." });
    }
    await publishStructure();
    ack({ ok: true, id: channelId });
    await logModeration(groupId, userId, null, {
      action: "channel_create",
      channel: channelSnapshot({ id: channelId, name, type, topic, category, slowMode }),
    });
    await postSystem(channelId, userId!, { type: "channel_create" });
  });

  socket.on("channel:delete", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const id = typeof payload?.id === "string" ? payload.id : "";
    const channel = channels.get(id);
    if (!channel) return ack({ ok: true }); // already gone
    if (!canManage(channel.groupId, userId)) return ack({ ok: false, error: MANAGE_CHANNELS_ERROR });
    if (channels.size <= 1) return ack({ ok: false, error: "You can't delete the last channel." });
    // What's about to be lost, for the log (its messages go with it).
    const { count } = await db.from("messages").select("id", { count: "exact", head: true })
      .eq("channel_id", id).is("deleted_at", null);
    const { error } = await db.from("channels").delete().eq("id", id);
    if (error) {
      console.error("channel delete failed:", error.message);
      return ack({ ok: false, error: "Couldn't delete the channel. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    await logModeration(channel.groupId, userId, null, {
      action: "channel_delete",
      channel: channelSnapshot(channel),
      ...(count !== null && { messageCount: count }),
    });
  });

  // Reordering sends the complete new order, checked against the current
  // one, so two tabs rearranging at once can't scramble positions.
  socket.on("groups:reorder", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    // Each member orders their own groups.
    const access = accessByMember.get(userId) ?? noAccess;
    const mine = [...access.groups.keys()].filter((groupId) => {
      const group = findGroup(groupId);
      return group && group.kind !== "dm"; // direct messages are listed by activity instead
    });
    if (!isPermutation(payload?.order, mine)) {
      return ack({ ok: false, error: "Your groups changed in the meantime. Try again." });
    }
    const results = await Promise.all(
      payload.order.map((groupId, position) =>
        db.from("group_members").update({ position }).eq("group_id", groupId).eq("member_id", userId),
      ),
    );
    const error = results.find((r) => r.error)?.error;
    if (error) {
      console.error("group reorder failed:", error.message);
      await loadAccess(userId); // back to what was saved
      refreshAccess(userId);
      return ack({ ok: false, error: "Couldn't save the new order. Try again." });
    }
    payload.order.forEach((groupId, position) => {
      const membership = access.groups.get(groupId);
      if (membership) membership.position = position;
    });
    refreshAccess(userId);
    ack({ ok: true });
  });

  socket.on("channel:move", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const id = typeof payload?.id === "string" ? payload.id : "";
    const channel = channels.get(id);
    const group = groups.find((g) => g.id === payload?.groupId);
    if (!channel || !group) return ack({ ok: false, error: "That channel or group no longer exists." });
    // Moving between groups takes managing both.
    if (!canManage(channel.groupId, userId) || !canManage(group.id, userId)) {
      return ack({ ok: false, error: MANAGE_CHANNELS_ERROR });
    }
    const category = optionalText(payload.category, 40);
    if (category === null) return ack({ ok: false, error: "Category names are limited to 40 characters." });
    const expected = [...group.subgroups.map((s) => s.id).filter((s) => s !== id), id];
    if (!isPermutation(payload.order, expected)) {
      return ack({ ok: false, error: "The channels changed in the meantime. Try again." });
    }

    const error = await writePositions("channels", payload.order, (channelId) =>
      channelId === id ? { group_id: group.id, category: category ?? null } : {},
    );
    await publishStructure();
    if (error) {
      console.error("channel move failed:", error.message);
      return ack({ ok: false, error: "Couldn't move the channel. Try again." });
    }
    ack({ ok: true });
    // Only moves to another section or group are logged, not reordering.
    const source = findGroup(channel.groupId);
    if (channel.groupId === group.id && (channel.category ?? undefined) === category) return;
    const record: ModerationRecord = {
      action: "channel_move",
      channel: channelSnapshot({ ...channel, category }),
      from: { groupId: channel.groupId, groupName: source?.name ?? "another group", ...(channel.category && { category: channel.category }) },
      to: { groupId: group.id, groupName: group.name, ...(category && { category }) },
    };
    await logModeration(group.id, userId, null, record);
    if (channel.groupId !== group.id) await logModeration(channel.groupId, userId, null, record);
  });

  socket.on("emoji:add", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = findGroup(payload?.groupId);
    if (!group || !canManage(group.id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can add emoji." });
    const name = typeof payload.name === "string" ? payload.name.trim().toLowerCase() : "";
    if (!isEmojiName(name)) return ack({ ok: false, error: "Emoji names are 2–32 lowercase letters, numbers or underscores." });
    const url = validAvatar(payload.url);
    if (!url) return ack({ ok: false, error: "Upload an image for the emoji." });
    if (group.emoji?.some((e) => e.name === name)) return ack({ ok: false, error: `:${name}: already exists here.` });
    if ((group.emoji?.length ?? 0) >= MAX_CUSTOM_EMOJI) {
      return ack({ ok: false, error: `A group can have up to ${MAX_CUSTOM_EMOJI} custom emoji.` });
    }
    const { error } = await db.from("group_emoji").insert({ group_id: group.id, name, url, created_by: userId });
    if (error) {
      console.error("emoji add failed:", error.message);
      return ack({ ok: false, error: "Couldn't add the emoji. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    await logModeration(group.id, userId, null, { action: "emoji_add", name, url });
  });

  socket.on("emoji:remove", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const group = findGroup(payload?.groupId);
    if (!group || !canManage(group.id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can remove emoji." });
    const name = typeof payload.name === "string" ? payload.name : "";
    const { data, error } = await db.from("group_emoji").delete().eq("group_id", group.id).eq("name", name).select("url");
    if (error) {
      console.error("emoji remove failed:", error.message);
      return ack({ ok: false, error: "Couldn't remove the emoji. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    if (data?.[0]) await logModeration(group.id, userId, null, { action: "emoji_remove", name, url: data[0].url });
  });

  socket.on("group:filter", (payload, ack) => {
    if (typeof ack !== "function") return;
    const group = findGroup(payload?.groupId);
    if (!group || !canEdit(group.id, socket.data.userId)) return ack(null);
    ack(blockedWords.get(group.id) ?? []);
  });
}
