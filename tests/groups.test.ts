import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventEnd, isListedEvent } from "../lib/chat/types/attachments.ts";
import { cleanChannelName, dmName, inviteUrl, isMine, notificationLevel } from "../lib/chat/types/groups.ts";

describe("cleanChannelName", () => {
  it("keeps capitals and single spaces", () => {
    assert.equal(cleanChannelName("Game Night"), "Game Night");
    assert.equal(cleanChannelName("  Game    Night  "), "Game Night");
  });

  it("drops symbols but keeps letters in any script, digits, dashes and underscores", () => {
    assert.equal(cleanChannelName("ui-kit_v2!"), "ui-kit_v2");
    assert.equal(cleanChannelName("café ☕"), "café");
    assert.equal(cleanChannelName("a--b"), "a-b");
  });

  it("is empty when nothing usable is left", () => {
    assert.equal(cleanChannelName("!!!"), "");
    assert.equal(cleanChannelName("   "), "");
  });

  it("caps the length without leaving a trailing space", () => {
    const long = cleanChannelName(`${"a".repeat(63)} b`);
    assert.equal(long, "a".repeat(63));
    assert.ok(cleanChannelName("x".repeat(100)).length <= 64);
  });
});

describe("notifications", () => {
  const group = { id: "g", kind: undefined };
  const dm = { id: "d", kind: "dm" as const };

  it("defaults to mentions in groups and everything in direct messages", () => {
    assert.equal(notificationLevel({}, group, "c"), "mentions");
    assert.equal(notificationLevel({}, dm, "c"), "all");
  });

  it("a channel's own setting beats its group's", () => {
    assert.equal(notificationLevel({ g: "none" }, group, "c"), "none");
    assert.equal(notificationLevel({ g: "none", c: "all" }, group, "c"), "all");
  });
});

describe("groups", () => {
  it("names a direct message after the others in it", () => {
    const users = { a: { name: "Ana" }, b: { name: "Ben" } } as never;
    assert.equal(dmName({ members: ["me", "a", "b"] }, users, "me"), "Ana, Ben");
    assert.equal(dmName({ members: ["me", "x"] }, users, "me"), "Unknown user");
  });

  it("lists groups you're in or invited to", () => {
    assert.equal(isMine({ role: "member" }), true);
    assert.equal(isMine({ invited: true }), true);
    assert.equal(isMine({}), false);
  });

  it("builds invite links on the app's origin", () => {
    assert.equal(inviteUrl("https://chat.example", "abc_DEF-12"), "https://chat.example/?invite=abc_DEF-12");
  });
});

describe("events", () => {
  const start = Date.UTC(2026, 9, 18, 12);

  it("ends at its end, the end of its day, or its start", () => {
    assert.equal(eventEnd({ startTime: start, endTime: start + 1000 }), start + 1000);
    assert.equal(eventEnd({ startTime: start, allDay: true }), start + 24 * 60 * 60 * 1000);
    assert.equal(eventEnd({ startTime: start }), start);
  });

  it("is listed on Discover only when public and not cancelled", () => {
    assert.equal(isListedEvent({}), false);
    assert.equal(isListedEvent({ visibility: "public" }), true);
    assert.equal(isListedEvent({ visibility: "public", cancelled: true }), false);
  });
});
