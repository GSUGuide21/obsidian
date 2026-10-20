// Groups and channels: loading them (with emoji, bots and custom roles), sending everyone the new list, and ordering.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { GroupRole } from "../chat/types";
import { isRolePermission } from "../chat/types/permissions.ts";
import { cleanSettings, listedGroups, syncRooms } from "./access.ts";
import { DEFAULT_SETTINGS } from "./constants.ts";
import { db } from "./db.ts";
import { discoverChanged } from "./discover.ts";
import { toMessage } from "./messages.ts";
import { io } from "./sockets.ts";
import {
  blockedWords,
  BOT_COLUMNS,
  botMemberId,
  botsByGroup,
  channels,
  latest,
  MEMBER_SELECT,
  members,
  setGroups,
  setSettings,
  toMemberRow,
  type BotRow,
  type MessageRow,
} from "./state.ts";

/** (Re)load groups and channels: at startup and after an admin changes them. */
export async function loadStructure() {
  const [groupRows, channelRows, dmRows, emojiRows, botRows, roleRows] = await Promise.all([
    db.from("groups").select("id, name, color, type, visibility, description, kind, blocked_words").order("position").order("created_at"),
    db.from("channels").select("id, group_id, name, topic, type, category, slow_mode").order("position").order("created_at"),
    // Who's in each direct message (its name is made from them).
    db.from("group_members").select("group_id, member_id, groups!inner(kind)").eq("groups.kind", "dm"),
    db.from("group_emoji").select("group_id, name, url").order("name"),
    db.from("group_bots").select(BOT_COLUMNS).order("created_at"),
    db.from("group_roles").select("id, group_id, name, color, permissions").order("position").order("created_at"),
  ]);
  for (const result of [groupRows, channelRows, dmRows, emojiRows, botRows, roleRows]) {
    if (result.error) throw new Error(`Couldn't load channels: ${result.error.message}`);
  }
  // Kept here only: members see a bot's name and commands, never its URL or secret.
  botsByGroup.clear();
  for (const row of botRows.data as BotRow[]) botsByGroup.set(row.group_id, [...(botsByGroup.get(row.group_id) ?? []), row]);
  const dmMembers = new Map<string, string[]>();
  for (const row of dmRows.data!) dmMembers.set(row.group_id, [...(dmMembers.get(row.group_id) ?? []), row.member_id]);

  channels.clear();
  for (const row of channelRows.data!) {
    channels.set(row.id, {
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      ...(row.topic && { topic: row.topic }),
      type: row.type,
      ...(row.category && { category: row.category }),
      ...(row.slow_mode > 0 && { slowMode: row.slow_mode }),
    });
  }
  // Kept here only: members never see a group's blocked words.
  blockedWords.clear();
  for (const row of groupRows.data!) if (row.blocked_words?.length) blockedWords.set(row.id, row.blocked_words);
  const emojiByGroup = new Map<string, { name: string; url: string }[]>();
  for (const row of emojiRows.data!) {
    emojiByGroup.set(row.group_id, [...(emojiByGroup.get(row.group_id) ?? []), { name: row.name, url: row.url }]);
  }
  const rolesByGroup = new Map<string, GroupRole[]>();
  for (const row of roleRows.data!) {
    const role = { id: row.id, name: row.name, color: row.color, permissions: row.permissions.filter(isRolePermission) };
    rolesByGroup.set(row.group_id, [...(rolesByGroup.get(row.group_id) ?? []), role]);
  }
  setGroups(groupRows.data!.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    type: row.type,
    visibility: row.visibility === "private" || row.kind === "dm" ? "private" : "public",
    ...(row.description && { description: row.description }),
    ...(row.kind === "dm" && { kind: "dm" as const, members: (dmMembers.get(row.id) ?? []).sort() }),
    ...(emojiByGroup.has(row.id) && { emoji: emojiByGroup.get(row.id) }),
    ...(rolesByGroup.has(row.id) && { roles: rolesByGroup.get(row.id) }),
    ...(botsByGroup.has(row.id) && {
      bots: botsByGroup.get(row.id)!.map((bot) => ({ id: bot.id, userId: botMemberId(bot.id), name: bot.name, commands: bot.commands })),
    }),
    subgroups: [...channels.values()].filter((c) => c.groupId === row.id),
  })));
  for (const channelId of latest.keys()) if (!channels.has(channelId)) latest.delete(channelId);
}

export async function loadState() {
  const [, memberRows, settingRows] = await Promise.all([
    loadStructure(),
    // Bots and signed-in members; guests are loaded on demand.
    db.from("members").select(MEMBER_SELECT).neq("kind", "guest")
      .order("last_seen_at", { ascending: false }).limit(1000),
    db.from("instance_settings").select("key, value"),
  ]);
  if (memberRows.error) throw new Error(`Couldn't load chat data: ${memberRows.error.message}`);
  if (settingRows.error) throw new Error(`Couldn't load settings: ${settingRows.error.message}`);
  for (const raw of memberRows.data) {
    const row = toMemberRow(raw);
    members.set(row.id, row);
  }
  setSettings(cleanSettings(Object.fromEntries(settingRows.data.map((row) => [row.key, row.value])), DEFAULT_SETTINGS));

  // Latest message per channel, for previews (thread replies don't count).
  await Promise.all(
    [...channels.keys()].map(async (channelId) => {
      const { data } = await db.from("messages").select("*").eq("channel_id", channelId).is("thread_id", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
      if (data?.[0]) latest.set(channelId, toMessage(data[0] as MessageRow));
    }),
  );
}

/** Reload groups and channels after a change and send everyone the groups they can see. */
export async function publishStructure() {
  try {
    await loadStructure();
  } catch (error) {
    // The change is saved; everyone gets it on the next successful reload or restart.
    console.error(error instanceof Error ? error.message : error);
    return;
  }
  for (const socket of io.sockets.sockets.values()) {
    syncRooms(socket);
    socket.emit("groups:update", listedGroups(socket.data.userId));
  }
  discoverChanged();
}

/** Whether `order` is exactly `ids` in some order (no extras, none missing). */
export function isPermutation(order: unknown, ids: string[]): order is string[] {
  if (!Array.isArray(order) || order.length !== ids.length) return false;
  const expected = new Set(ids);
  return new Set(order).size === order.length && order.every((id) => typeof id === "string" && expected.has(id));
}

/** Write positions 0..n-1 following `order`. */
export async function writePositions(table: "groups" | "channels", order: string[], extra?: (id: string) => object) {
  const results = await Promise.all(
    order.map((id, position) => db.from(table).update({ position, ...extra?.(id) }).eq("id", id)),
  );
  return results.find((r) => r.error)?.error;
}

export async function nextPosition(table: "groups" | "channels", groupId?: string) {
  let query = db.from(table).select("position").order("position", { ascending: false }).limit(1);
  if (groupId) query = query.eq("group_id", groupId);
  const { data } = await query;
  return (data?.[0]?.position ?? -1) + 1;
}
