import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachmentText,
  cleanBlockedWords,
  findBlockedWord,
  formatSlowMode,
  isPrivateAddress,
  isSlowMode,
  MAX_BLOCKED_WORDS,
} from "../lib/chat/safety.ts";

describe("blocked words", () => {
  it("cleans a typed list: lines or commas, lowercase, no blanks or repeats", () => {
    assert.deepEqual(cleanBlockedWords("Spoiler\nbuy  NOW, spoiler,\n\n"), ["spoiler", "buy now"]);
    assert.deepEqual(cleanBlockedWords(["A", "a", "b"]), ["a", "b"]);
    assert.deepEqual(cleanBlockedWords(""), []);
  });

  it("refuses too many or too long", () => {
    assert.equal(cleanBlockedWords("x".repeat(41)), null);
    assert.equal(cleanBlockedWords(Array.from({ length: MAX_BLOCKED_WORDS + 1 }, (_, i) => `w${i}`)), null);
    assert.equal(cleanBlockedWords(42), null);
    assert.equal(cleanBlockedWords([1]), null);
  });

  it("matches whole words and phrases, ignoring case and spacing", () => {
    assert.equal(findBlockedWord("That's a SPOILER!", ["spoiler"]), "spoiler");
    assert.equal(findBlockedWord("buy   now please", ["buy now"]), "buy now");
    assert.equal(findBlockedWord("ＳＰＯＩＬＥＲ", ["spoiler"]), "spoiler");
  });

  it("doesn't match inside other words", () => {
    assert.equal(findBlockedWord("a classic class", ["ass"]), undefined);
    assert.equal(findBlockedWord("spoilers", ["spoiler"]), undefined);
    assert.equal(findBlockedWord("anything", []), undefined);
  });

  it("treats regex characters literally", () => {
    assert.equal(findBlockedWord("a.b", ["a.b"]), "a.b");
    assert.equal(findBlockedWord("axb", ["a.b"]), undefined);
  });
});

describe("text inside attachments (also word-filtered)", () => {
  it("collects polls, quizzes, events and captions", () => {
    const text = attachmentText([
      { type: "poll", question: "Lunch?", options: ["Pizza", "Tacos"] },
      { type: "event", title: "Launch", description: "Big day", location: "HQ", startTime: 0 },
      { type: "image", src: "https://x/y.png", caption: "Our team" },
    ]);
    for (const part of ["Lunch?", "Pizza", "Tacos", "Launch", "Big day", "HQ", "Our team"]) {
      assert.ok(text.includes(part), part);
    }
  });

  it("ignores attachments without words of their own", () => {
    assert.equal(attachmentText([{ type: "mention", userId: "u" }, { type: "file", src: "https://x/f.pdf" }]), "");
  });

  it("lets the filter catch a blocked word in a poll", () => {
    const text = attachmentText([{ type: "poll", question: "Want a spoiler?", options: ["yes", "no"] }]);
    assert.equal(findBlockedWord(text, ["spoiler"]), "spoiler");
  });
});

describe("slow mode", () => {
  it("accepts only the offered values", () => {
    assert.equal(isSlowMode(0), true);
    assert.equal(isSlowMode(30), true);
    assert.equal(isSlowMode(31), false);
    assert.equal(isSlowMode("30"), false);
  });

  it("reads naturally", () => {
    assert.equal(formatSlowMode(5), "5 seconds");
    assert.equal(formatSlowMode(60), "1 minute");
    assert.equal(formatSlowMode(300), "5 minutes");
    assert.equal(formatSlowMode(3600), "1 hour");
  });
});

describe("private addresses (never fetched for previews)", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "255.255.255.255",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "[::1]",
    "999.1.1.1",
    "not an ip",
  ]) {
    it(`blocks ${ip}`, () => assert.equal(isPrivateAddress(ip), true));
  }

  for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    it(`allows ${ip}`, () => assert.equal(isPrivateAddress(ip), false));
  }
});
