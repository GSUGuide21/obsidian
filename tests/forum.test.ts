import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listPosts, matchesPost, postOrder } from "../lib/chat/forum.ts";
import type { Message } from "../lib/chat/types/messages.ts";
import { cleanForumTags, postTags } from "../lib/server/validation.ts";

type Post = Message & { status?: "sending" | "failed" };

const post = (id: string, createdAt: number, extra: Partial<Post> = {}): Post => ({
  id,
  subgroupId: "forum",
  authorId: "a",
  text: "",
  createdAt,
  title: id,
  ...extra,
});

const reply = (lastAt: number) => ({ count: 1, lastAt, participants: [] });

describe("postOrder", () => {
  it("goes by the latest reply for activity, and by posting time for newest", () => {
    const p = post("p", 10, { thread: reply(50) });
    assert.equal(postOrder(p, "activity"), 50);
    assert.equal(postOrder(p, "newest"), 10);
  });
});

describe("matchesPost", () => {
  it("needs every word, in the title or the text", () => {
    const p = post("p", 0, { title: "Release notes", text: "Version two is out" });
    assert.ok(matchesPost(p, { query: "release two" }));
    assert.ok(!matchesPost(p, { query: "release three" }));
  });

  it("needs the tag when one is given", () => {
    assert.ok(matchesPost(post("p", 0, { tags: ["bug"] }), { tag: "bug" }));
    assert.ok(!matchesPost(post("p", 0), { tag: "bug" }));
  });
});

describe("listPosts", () => {
  it("lists by activity: a fresh reply lifts an old post", () => {
    const posts = [post("old", 1, { thread: reply(100) }), post("new", 50)];
    assert.deepEqual(listPosts(posts, { sort: "activity" }).map((p) => p.id), ["old", "new"]);
    assert.deepEqual(listPosts(posts, { sort: "newest" }).map((p) => p.id), ["new", "old"]);
  });

  it("puts unsent posts first, then pinned ones", () => {
    const posts = [post("a", 30), post("pinned", 10, { pinned: { at: 0, by: "x" } }), post("sending", 5, { status: "sending" })];
    assert.deepEqual(listPosts(posts, { sort: "activity" }).map((p) => p.id), ["sending", "pinned", "a"]);
  });

  it("leaves out posts past the loaded pages, unless unsent", () => {
    const posts = [post("in", 30), post("edge", 20), post("past", 10), post("sending", 1, { status: "sending" })];
    assert.deepEqual(listPosts(posts, { sort: "newest" }, 20).map((p) => p.id), ["sending", "in", "edge"]);
  });

  it("skips system messages, and deleted posts with no replies", () => {
    const posts = [
      post("system", 3, { system: { type: "channel_create" } }),
      post("gone", 2, { deleted: true }),
      post("gone-with-replies", 1, { deleted: true, thread: reply(1) }),
    ];
    assert.deepEqual(listPosts(posts, { sort: "newest" }).map((p) => p.id), ["gone-with-replies"]);
  });
});

describe("cleanForumTags", () => {
  it("keeps known ids, gives new tags one, and cleans names", () => {
    const tags = cleanForumTags([{ id: "keep", name: "  Bug   report " }, { id: "made-up", name: "Idea" }], [{ id: "keep", name: "Bug" }]);
    assert.ok(Array.isArray(tags));
    assert.deepEqual(tags[0], { id: "keep", name: "Bug report" });
    assert.notEqual(tags[1].id, "made-up");
    assert.equal(tags[1].name, "Idea");
  });

  it("refuses blank, duplicate and too many tags", () => {
    assert.equal(typeof cleanForumTags([{ name: " " }]), "string");
    assert.equal(typeof cleanForumTags([{ name: "Bug" }, { name: "bug" }]), "string");
    assert.equal(typeof cleanForumTags(Array.from({ length: 21 }, (_, i) => ({ name: `t${i}` }))), "string");
  });
});

describe("postTags", () => {
  const forum = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, name: id }));

  it("keeps the forum's own tags, once each, up to five", () => {
    assert.deepEqual(postTags(["a", "a", "zzz", "b"], forum), ["a", "b"]);
    assert.equal(postTags(["a", "b", "c", "d", "e", "f"], forum)?.length, 5);
  });

  it("is null when there are none", () => {
    assert.equal(postTags([], forum), null);
    assert.equal(postTags("a", forum), null);
  });
});
