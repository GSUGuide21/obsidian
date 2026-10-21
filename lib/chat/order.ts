import type { Group, Subgroup } from "./types";

/**
 * Sidebar sections of a group: uncategorized channels first, then each
 * category, in the group's order (`categories`, which may list empty ones),
 * then any others channels use, in order of their first channel.
 */
export function sections(subgroups: Subgroup[], categories: readonly string[] = []) {
  const loose: Subgroup[] = [];
  const byCategory = new Map<string, Subgroup[]>(categories.map((name) => [name, []]));
  for (const subgroup of subgroups) {
    if (!subgroup.category) loose.push(subgroup);
    else byCategory.set(subgroup.category, [...(byCategory.get(subgroup.category) ?? []), subgroup]);
  }
  return { loose, categories: [...byCategory] };
}

/** Channels in the order the sidebar shows them. */
export function visualOrder(subgroups: Subgroup[], categories: readonly string[] = []) {
  const { loose, categories: sorted } = sections(subgroups, categories);
  return [...loose, ...sorted.flatMap(([, list]) => list)];
}

/** Every category of a group, empty ones included, in the order the sidebar shows them. */
export function categoryOrder(group: Pick<Group, "subgroups" | "categories">) {
  return sections(group.subgroups, group.categories).categories.map(([name]) => name);
}

/** Whether a category of that name is in the group already (names are compared regardless of case). */
export function hasCategory(group: Pick<Group, "subgroups" | "categories">, name: string) {
  const lower = name.toLowerCase();
  return categoryOrder(group).some((c) => c.toLowerCase() === lower);
}

/**
 * Category `name` moved before `beforeName` (null: last): the group's new
 * category order, and its channels' order to match (each category's channels
 * together, in their section's order). Null if it isn't one of the group's.
 */
export function moveCategory(group: Pick<Group, "subgroups" | "categories">, name: string, beforeName: string | null) {
  const current = categoryOrder(group);
  if (!current.includes(name)) return null;
  const categories = current.filter((c) => c !== name);
  const at = beforeName ? categories.indexOf(beforeName) : -1;
  categories.splice(at < 0 ? categories.length : at, 0, name);
  return { categories, order: visualOrder(group.subgroups, categories).map((s) => s.id) };
}

/** Category `name` one step up (-1) or down (+1); null at either end. */
export function stepCategory(group: Pick<Group, "subgroups" | "categories">, name: string, step: -1 | 1) {
  const current = categoryOrder(group);
  const at = current.indexOf(name);
  const target = at + step;
  if (at < 0 || target < 0 || target >= current.length) return null;
  // Moving down by one = going before the category two places down (or last).
  return moveCategory(group, name, step === -1 ? current[target] : (current[target + 1] ?? null));
}

/**
 * The channel a group opens to: its first uncategorized text channel, else
 * its first text channel, else its first (as mainChannel in server.mts).
 */
export function mainChannel(group: Pick<Group, "subgroups" | "categories">) {
  const list = visualOrder(group.subgroups, group.categories);
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
  const all = visualOrder(group.subgroups, group.categories);
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
  const section = visualOrder(group.subgroups, group.categories).filter((s) => s.category === channel.category);
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
