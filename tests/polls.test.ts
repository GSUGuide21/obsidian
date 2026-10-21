import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isClosed } from "../lib/chat/types/attachments.ts";
import { sanitizeAttachment } from "../lib/server/validation.ts";

describe("poll attachments", () => {
  const poll = { type: "poll", question: "Lunch?", options: ["Pizza", "Tacos"] };

  it("are single-choice unless marked multiple", () => {
    assert.deepEqual(sanitizeAttachment(poll), poll);
  });

  it("keep the multiple-choice flag", () => {
    assert.deepEqual(sanitizeAttachment({ ...poll, multiple: true }), { ...poll, multiple: true });
  });

  it("only take it when it's exactly true", () => {
    assert.deepEqual(sanitizeAttachment({ ...poll, multiple: "yes" }), poll);
  });
});

describe("poll limits and closing", () => {
  const poll = { type: "poll", question: "Toppings?", options: ["Cheese", "Basil", "Olives", "Ham"] };
  const later = Date.now() + 60 * 60 * 1000;

  it("keeps a limit between two and one fewer than the options, on multiple-choice polls", () => {
    assert.deepEqual(sanitizeAttachment({ ...poll, multiple: true, maxChoices: 2 }), { ...poll, multiple: true, maxChoices: 2 });
    assert.deepEqual(sanitizeAttachment({ ...poll, multiple: true, maxChoices: 4 }), { ...poll, multiple: true });
    assert.deepEqual(sanitizeAttachment({ ...poll, multiple: true, maxChoices: 1 }), { ...poll, multiple: true });
    assert.deepEqual(sanitizeAttachment({ ...poll, maxChoices: 2 }), poll);
  });

  it("keeps a closing time in the future, and refuses one in the past", () => {
    assert.deepEqual(sanitizeAttachment({ ...poll, closesAt: later }), { ...poll, closesAt: later });
    assert.equal(sanitizeAttachment({ ...poll, closesAt: Date.now() - 1000 }), undefined);
    assert.equal(sanitizeAttachment({ ...poll, closesAt: "soon" }), undefined);
  });

  it("lets quizzes close too", () => {
    const quiz = { type: "quiz", question: "2 + 2?", options: ["3", "4"], correctAnswer: "4" };
    assert.deepEqual(sanitizeAttachment({ ...quiz, closesAt: later }), { ...quiz, closesAt: later });
  });
});

describe("isClosed", () => {
  it("is closed once its time has passed, and never without one", () => {
    assert.equal(isClosed({ closesAt: 100 }, 100), true);
    assert.equal(isClosed({ closesAt: 100 }, 99), false);
    assert.equal(isClosed({}, Date.now()), false);
  });
});
