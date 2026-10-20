import type { Group, Subgroup } from "./types";

/**
 * Sidebar sections of a group: uncategorized channels first, then each
 * category in order of its first channel.
 */
export function sections(subgroups: Subgroup[]) {
  const loose: Subgroup[] = [];
  const byCategory = new Map<string, Subgroup[]>();
  for (const subgroup of subgroups) {
    if (!subgroup.category) loose.push(subgroup);
    else byCategory.set(subgroup.category, [...(byCategory.get(subgroup.category) ?? []), subgroup]);
  }
  return { loose, categories: [...byCategory] };
}

/** Channels in the order the sidebar shows them. */
export function visualOrder(subgroups: Subgroup[]) {
  const { loose, categories } = sections(subgroups);
  return [...loose, ...categories.flatMap(([, list]) => list)];
}

/**
 * The channel a group opens to: its first uncategorized text channel, else
 * its first text channel, else its first (as mainChannel in server.mts).
 */
export function mainChannel(group: Pick<Group, "subgroups">) {
  const list = visualOrder(group.subgroups);
  const text = list.filter((s) => (s.type ?? "text") === "text");
  return text.find((s) => !s.category) ?? text[0] ?? list[0];
}

export type ChannelMove = { id: string; groupId: string; category?: string; order: string[] };

/**
 * Where channel `id` ends up when placed in `groupId`/`category`, before
 * channel `beforeId`, or at the end of that section when `beforeId` is null.
 * Returns the full new order of the destination group, as the server expects.
 */
export function moveChannel(
  groups: Group[],
  id: string,
  groupId: string,
  category: string | undefined,
  beforeId: string | null,
): ChannelMove | null {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  const all = visualOrder(group.subgroups);
  // "Before itself" (dropped just below the channel above it): stay put.
  if (beforeId === id) beforeId = all[all.findIndex((s) => s.id === id) + 1]?.id ?? null;
  const rest = all.filter((s) => s.id !== id);
  let index: number;
  if (beforeId) {
    index = rest.findIndex((s) => s.id === beforeId);
    if (index < 0) index = rest.length;
  } else {
    const last = rest.findLastIndex((s) => (s.category ?? undefined) === category);
    // A new uncategorized channel sorts first anyway; a new category goes last.
    index = last >= 0 ? last + 1 : category ? rest.length : 0;
  }
  const order = rest.map((s) => s.id);
  order.splice(index, 0, id);
  return { id, groupId, ...(category && { category }), order };
}

/**
 * Move a channel one step up (-1) or down (+1) within its sidebar section.
 * Null at the edge of the section.
 */
export function stepChannel(groups: Group[], channel: Subgroup, step: -1 | 1): ChannelMove | null {
  const group = groups.find((g) => g.id === channel.groupId);
  if (!group) return null;
  const section = visualOrder(group.subgroups).filter((s) => s.category === channel.category);
  const at = section.findIndex((s) => s.id === channel.id);
  const target = at + step;
  if (at < 0 || target < 0 || target >= section.length) return null;
  // Moving down by one = going before the channel two places down (or the end).
  const before = step === -1 ? section[target].id : (section[target + 1]?.id ?? null);
  return moveChannel(groups, channel.id, group.id, channel.category, before);
}

/** All group ids with `id` moved before `beforeId` (null: last). */
export function moveGroup(groups: Group[], id: string, beforeId: string | null) {
  const order = groups.map((g) => g.id).filter((g) => g !== id);
  const index = beforeId ? order.indexOf(beforeId) : -1;
  order.splice(index < 0 ? order.length : index, 0, id);
  return order;
}

/** All group ids with `id` one step up (-1) or down (+1); null at either end. */
export function stepGroup(groups: Group[], id: string, step: -1 | 1) {
  const at = groups.findIndex((g) => g.id === id);
  const target = at + step;
  if (at < 0 || target < 0 || target >= groups.length) return null;
  const order = groups.map((g) => g.id);
  [order[at], order[target]] = [order[target], order[at]];
  return order;
}
