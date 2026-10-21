// Groups and channels: creating, editing, ordering and deleting them, direct messages, discover, wiki pages, custom emoji, stickers and the word filter.

import { cleanBlockedWords, isSlowMode } from "../../chat/safety.ts";
import type { ChannelAccess, Group, ModerationRecord } from "../../chat/types";
import { categoryOrder, hasCategory, moveCategory } from "../../chat/order.ts";
import {
  isDisappearAfter,
  isEmojiName,
  MAX_CATEGORIES,
  MAX_CATEGORY_LENGTH,
  MAX_CHANNEL_MEMBERS,
  MAX_CUSTOM_EMOJI,
  MAX_STICKERS,
} from "../../chat/types/groups.ts";
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
import { cleanChannelName, cleanForumTags, newId, optionalText } from "../validation.ts";

/**
 * Who a private channel lets in, from a channel draft: null makes it public;
 * otherwise the group's own custom roles and members among those named. A
 * string says what's wrong.
 */
async function cleanChannelAccess(value: unknown, group: Group): Promise<ChannelAccess | null | string> {
  if (value === null) return null;
  if (group.kind === "dm") return "Direct messages can't have private channels.";
  const draft = (value ?? {}) as { roles?: unknown; members?: unknown };
  const strings = (list: unknown) => (Array.isArray(list) ? [...new Set(list.filter((v): v is string => typeof v === "string"))] : []);
  const known = new Set((group.roles ?? []).map((role) => role.id));
  const roles = strings(draft.roles).filter((id) => known.has(id));
  const asked = strings(draft.members);
  if (asked.length > MAX_CHANNEL_MEMBERS) return `A private channel can let in up to ${MAX_CHANNEL_MEMBERS} people by name. Use a role for more.`;
  if (asked.length === 0) return { roles, members: [] };
  const { data, error } = await db.from("group_members").select("member_id").eq("group_id", group.id).in("member_id", asked);
  if (error) {
    console.error("checking channel members failed:", error.message);
    return "Couldn't save the channel. Try again.";
  }
  const inGroup = new Set((data ?? []).map((row) => row.member_id as string));
  return { roles, members: asked.filter((id) => inGroup.has(id)) };
}

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
    if (members.get(userId)?.kind !== "user") return ack({ ok: false, error: "Sign in to send direct messages." });
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
    if (members.get(userId)?.kind === "guest") return ack({ ok: false, error: "Sign in to edit pages." });
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
      return ack({ ok: false, error: "Sign in to create groups." });
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
    const disappearAfter = payload?.disappearAfter ?? 0;
    if (!isDisappearAfter(disappearAfter)) return ack({ ok: false, error: "Pick a disappearing messages setting." });
    const id = typeof payload?.id === "string" ? payload.id : undefined;
    // A forum's tags (kept when it's switched to another type, in case it's switched back).
    const tags = payload?.tags === undefined ? undefined : cleanForumTags(payload.tags, id ? channels.get(id)?.tags : []);
    if (typeof tags === "string") return ack({ ok: false, error: tags });
    // Private or not, and who it lets in (only the group's own roles and members).
    const target = findGroup(id ? channels.get(id)?.groupId : payload?.groupId);
    const access = payload?.access === undefined || !target ? undefined : await cleanChannelAccess(payload.access, target);
    if (typeof access === "string") return ack({ ok: false, error: access });
    const values = {
      name,
      type,
      topic: topic ?? null,
      category: category ?? null,
      slow_mode: slowMode,
      disappear_after: disappearAfter || null,
      ...(tags && { forum_tags: tags }),
      ...(access !== undefined && {
        private: access !== null,
        allowed_roles: access?.roles ?? [],
        allowed_members: access?.members ?? [],
      }),
    };

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
      const after = channelSnapshot({ id, name, type, topic, category, slowMode, disappearAfter, tags: tags ?? previous.tags });
      if (changed(before, after)) {
        await logModeration(previous.groupId, userId, null, { action: "channel_update", before, after });
      }
      if (previous.name !== name) await postSystem(id, userId!, { type: "channel_rename", from: previous.name, to: name });
      if ((previous.topic ?? undefined) !== topic) {
        await postSystem(id, userId!, { type: "channel_topic", ...(topic && { topic }) });
      }
      // Everyone should know when what they write starts (or stops) disappearing.
      if ((previous.disappearAfter ?? 0) !== disappearAfter) {
        await postSystem(id, userId!, { type: "channel_disappear", ...(disappearAfter && { after: disappearAfter }) });
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
      channel: channelSnapshot({ id: channelId, name, type, topic, category, slowMode, disappearAfter, ...(tags && { tags }) }),
    });
    await postSystem(channelId, userId!, { type: "channel_create" });
    if (disappearAfter) await postSystem(channelId, userId!, { type: "channel_disappear", after: disappearAfter });
  });

  // Just the timer, so direct messages (which nobody manages) can have one: anyone in them sets it.
  socket.on("channel:disappear", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const channel = channelFor(payload?.subgroupId, userId);
    if (!channel) return ack({ ok: false, error: "That chat no longer exists." });
    const after = payload.after;
    if (!isDisappearAfter(after)) return ack({ ok: false, error: "Pick a disappearing messages setting." });
    const dm = findGroup(channel.groupId)?.kind === "dm";
    if (dm ? !roleIn(channel.groupId, userId) : !canManage(channel.groupId, userId)) {
      return ack({ ok: false, error: dm ? "Only the people in this conversation can change that." : MANAGE_CHANNELS_ERROR });
    }
    if ((channel.disappearAfter ?? 0) === after) return ack({ ok: true });
    const { error } = await db.from("channels").update({ disappear_after: after || null }).eq("id", channel.id);
    if (error) {
      console.error("disappearing messages update failed:", error.message);
      return ack({ ok: false, error: "Couldn't change it. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    if (!dm) {
      await logModeration(channel.groupId, userId, null, {
        action: "channel_update",
        before: channelSnapshot(channel),
        after: channelSnapshot({ ...channel, disappearAfter: after || undefined }),
      });
    }
    await postSystem(channel.id, userId, { type: "channel_disappear", ...(after && { after }) });
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

  // ---- Categories: a group's sidebar sections, empty ones included (see categoryOrder). ----

  /** The group whose categories `userId` may change, or why not. */
  function categoryGroup(groupId: unknown, userId: string | undefined) {
    if (!userId) return { error: "You're not signed in." };
    if (!canSend(userId)) return { error: "Slow down a little and try again." };
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.kind === "dm") return { error: "That group no longer exists." };
    if (!canManage(group.id, userId)) return { error: MANAGE_CHANNELS_ERROR };
    return { group };
  }

  /** A category name from a payload, or why it isn't one. */
  function categoryName(value: unknown): { name: string } | { error: string } {
    const name = optionalText(value, MAX_CATEGORY_LENGTH);
    if (name === null) return { error: `Category names are limited to ${MAX_CATEGORY_LENGTH} characters.` };
    if (!name) return { error: "Give the category a name." };
    return { name };
  }

  async function saveCategories(groupId: string, categories: string[]) {
    const { error } = await db.from("groups").update({ categories }).eq("id", groupId);
    if (error) console.error("saving categories failed:", error.message);
    return error;
  }

  socket.on("category:create", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const { group, error } = categoryGroup(payload?.groupId, userId);
    if (!group) return ack({ ok: false, error });
    const named = categoryName(payload.name);
    if ("error" in named) return ack({ ok: false, error: named.error });
    const { name } = named;
    if (hasCategory(group, name)) return ack({ ok: false, error: `There's already a category called “${name}”.` });
    const current = categoryOrder(group);
    if (current.length >= MAX_CATEGORIES) return ack({ ok: false, error: `A group can have up to ${MAX_CATEGORIES} categories.` });
    // New ones go last; storing the whole order keeps ones that only channels named in their place.
    if (await saveCategories(group.id, [...current, name])) return ack({ ok: false, error: "Couldn't make the category. Try again." });
    await publishStructure();
    ack({ ok: true });
    await logModeration(group.id, userId!, null, { action: "category_create", name });
  });

  socket.on("category:rename", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const { group, error } = categoryGroup(payload?.groupId, userId);
    if (!group) return ack({ ok: false, error });
    const from = typeof payload.from === "string" ? payload.from : "";
    const current = categoryOrder(group);
    if (!current.includes(from)) return ack({ ok: false, error: "That category no longer exists." });
    const named = categoryName(payload.to);
    if ("error" in named) return ack({ ok: false, error: named.error });
    const to = named.name;
    if (to === from) return ack({ ok: true });
    // Changing only the case of its own name is fine; taking another's name isn't.
    if (to.toLowerCase() !== from.toLowerCase() && hasCategory(group, to)) {
      return ack({ ok: false, error: `There's already a category called “${to}”.` });
    }
    const { error: moveError } = await db.from("channels").update({ category: to }).eq("group_id", group.id).eq("category", from);
    const saveError = moveError ?? (await saveCategories(group.id, current.map((c) => (c === from ? to : c))));
    await publishStructure();
    if (saveError) {
      console.error("category rename failed:", saveError.message);
      return ack({ ok: false, error: "Couldn't rename the category. Try again." });
    }
    ack({ ok: true });
    await logModeration(group.id, userId!, null, { action: "category_rename", from, to });
  });

  socket.on("category:delete", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const { group, error } = categoryGroup(payload?.groupId, userId);
    if (!group) return ack({ ok: false, error });
    const name = typeof payload.name === "string" ? payload.name : "";
    const current = categoryOrder(group);
    if (!current.includes(name)) return ack({ ok: false, error: "That category no longer exists." });
    // Its channels stay, uncategorized (at the top of the group).
    const channelCount = group.subgroups.filter((s) => s.category === name).length;
    const { error: moveError } = await db.from("channels").update({ category: null }).eq("group_id", group.id).eq("category", name);
    const saveError = moveError ?? (await saveCategories(group.id, current.filter((c) => c !== name)));
    await publishStructure();
    if (saveError) {
      console.error("category delete failed:", saveError.message);
      return ack({ ok: false, error: "Couldn't delete the category. Try again." });
    }
    ack({ ok: true });
    await logModeration(group.id, userId!, null, { action: "category_delete", name, channelCount });
  });

  // Reordering, like channels' (not logged).
  socket.on("category:move", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const { group, error } = categoryGroup(payload?.groupId, userId);
    if (!group) return ack({ ok: false, error });
    const before = typeof payload.before === "string" ? payload.before : null;
    const move = typeof payload.name === "string" ? moveCategory(group, payload.name, before) : null;
    if (!move) return ack({ ok: false, error: "That category no longer exists." });
    // The channels follow, so their positions match the sidebar for everything that reads them.
    const saveError = (await saveCategories(group.id, move.categories)) ?? (await writePositions("channels", move.order));
    await publishStructure();
    if (saveError) {
      console.error("category move failed:", saveError.message);
      return ack({ ok: false, error: "Couldn't move the category. Try again." });
    }
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

  socket.on("sticker:add", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const group = findGroup(payload?.groupId);
    if (!group || !canManage(group.id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can add stickers." });
    const name = typeof payload.name === "string" ? payload.name.trim().toLowerCase() : "";
    if (!isEmojiName(name)) return ack({ ok: false, error: "Sticker names are 2–32 lowercase letters, numbers or underscores." });
    const url = validAvatar(payload.url);
    if (!url) return ack({ ok: false, error: "Upload an image for the sticker." });
    if (group.stickers?.some((s) => s.name === name)) return ack({ ok: false, error: `There's already a sticker called "${name}".` });
    if ((group.stickers?.length ?? 0) >= MAX_STICKERS) {
      return ack({ ok: false, error: `A group can have up to ${MAX_STICKERS} stickers.` });
    }
    const { error } = await db.from("group_stickers").insert({ group_id: group.id, name, url, created_by: userId });
    if (error) {
      console.error("sticker add failed:", error.message);
      return ack({ ok: false, error: "Couldn't add the sticker. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    await logModeration(group.id, userId, null, { action: "sticker_add", name, url });
  });

  socket.on("sticker:remove", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const group = findGroup(payload?.groupId);
    if (!group || !canManage(group.id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can remove stickers." });
    const name = typeof payload.name === "string" ? payload.name : "";
    const { data, error } = await db.from("group_stickers").delete().eq("group_id", group.id).eq("name", name).select("url");
    if (error) {
      console.error("sticker remove failed:", error.message);
      return ack({ ok: false, error: "Couldn't remove the sticker. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    if (data?.[0]) await logModeration(group.id, userId, null, { action: "sticker_remove", name, url: data[0].url });
  });

  socket.on("group:filter", (payload, ack) => {
    if (typeof ack !== "function") return;
    const group = findGroup(payload?.groupId);
    if (!group || !canEdit(group.id, socket.data.userId)) return ack(null);
    ack(blockedWords.get(group.id) ?? []);
  });
}
