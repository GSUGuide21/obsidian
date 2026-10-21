// Forum channels: which of the loaded posts to list, and in what order.
// Pages come from "forum:posts" in the forum's order; live updates add and
// move posts in between, so the list is rebuilt from what's loaded.

import type { ForumQuery, Message } from "./types";
import { postActivity } from "./types/messages.ts";

/** Where a post falls in the order (ms): its activity, or when it was posted. */
export function postOrder(post: Pick<Message, "createdAt" | "thread">, sort: ForumQuery["sort"]) {
  return sort === "newest" ? post.createdAt : postActivity(post);
}

/** Whether a post matches like "forum:posts" does: every word of `query` in its title or text, and `tag` among its tags. */
export function matchesPost(post: Pick<Message, "title" | "text" | "tags">, { query, tag }: Omit<ForumQuery, "sort">) {
  if (tag && !post.tags?.includes(tag)) return false;
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${post.title ?? ""}\n${post.text}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * The posts to list, in order: unsent ones first, then pinned ones, then the
 * rest newest first. System messages aren't posts, and deleted posts only stay
 * while their thread does. `boundary` (ms) is where the loaded pages end (see
 * ForumPage): posts past it are left out, since others between may not be
 * loaded yet; absent once every page is.
 */
export function listPosts<T extends Message & { status?: string }>(posts: T[], query: ForumQuery, boundary?: number) {
  return posts
    .filter((p) => !p.system && (!p.deleted || p.thread) && matchesPost(p, query))
    .filter((p) => p.status || boundary === undefined || postOrder(p, query.sort) >= boundary)
    .sort((a, b) => {
      const rank = (p: T) => (p.status ? 0 : p.pinned ? 1 : 2);
      return (
        rank(a) - rank(b) ||
        postOrder(b, query.sort) - postOrder(a, query.sort) ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
      );
    });
}
