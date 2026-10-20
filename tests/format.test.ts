import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorName, formatDateTime, formatTime, setClock, summarize } from "../lib/chat/format.ts";

describe("summarize", () => {
  it("uses the text when there is some", () => {
    assert.equal(summarize({ text: "hello" }), "hello");
  });

  it("describes attachment-only messages", () => {
    assert.equal(summarize({ text: "", attachments: [{ type: "event", title: "Launch", startTime: 0 }] }), "Event: Launch");
    assert.match(summarize({ text: "", attachments: [{ type: "poll", question: "Lunch?", options: ["a", "b"] }] }), /Lunch\?/);
  });

  it("says when a message was deleted", () => {
    assert.equal(summarize({ text: "", deleted: true }), "Message deleted");
  });
});

describe("authorName", () => {
  it("falls back for people who are gone", () => {
    assert.equal(authorName(undefined, "guest-123"), "Former guest");
    assert.equal(authorName(undefined, "abc"), "Unknown user");
  });
});

describe("setClock", () => {
  const afternoon = new Date(2026, 0, 1, 15, 42).getTime();

  it("shows times on the chosen clock", () => {
    setClock("24h");
    assert.match(formatTime(afternoon), /15.42/);
    assert.match(formatDateTime(afternoon), /15.42/);
    setClock("12h");
    assert.match(formatTime(afternoon), /3.42/);
    assert.doesNotMatch(formatTime(afternoon), /15/);
    assert.match(formatDateTime(afternoon), /3.42/);
  });

  it("goes back to the locale's own clock", () => {
    setClock("auto");
    const locale = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(afternoon);
    assert.equal(formatTime(afternoon), locale);
  });
});
