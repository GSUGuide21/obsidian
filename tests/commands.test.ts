import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCommand, suggestCommands } from "../lib/chat/commands.ts";
import { customEmojiName, isEmojiName, webhookUrl } from "../lib/chat/types/groups.ts";

describe("slash commands", () => {
  it("/me italicizes the action", () => {
    assert.deepEqual(runCommand("/me waves"), { kind: "send", text: "_waves_" });
    assert.equal(runCommand("/me"), null);
  });

  it("appends the faces, escaped for Markdown", () => {
    assert.deepEqual(runCommand("/shrug"), { kind: "send", text: "¯\\\\\\_(ツ)\\_/¯" });
    assert.deepEqual(runCommand("/tableflip  enough"), { kind: "send", text: "enough (╯°□°)╯︵ ┻━┻" });
    assert.deepEqual(runCommand("/UNFLIP"), { kind: "send", text: "┬─┬ノ( º _ ºノ)" });
  });

  it("opens dialogs", () => {
    assert.deepEqual(runCommand("/gif cats"), { kind: "open", dialog: "gif", query: "cats" });
    assert.deepEqual(runCommand("/gif"), { kind: "open", dialog: "gif" });
    assert.deepEqual(runCommand("/poll"), { kind: "open", dialog: "poll" });
  });

  it("leaves anything else as text", () => {
    assert.equal(runCommand("/usr/bin is a path"), null);
    assert.equal(runCommand("/nope"), null);
    assert.equal(runCommand("hello /me"), null);
  });

  it("suggests commands while the name is being typed", () => {
    assert.deepEqual(suggestCommands("/t").map((c) => c.name), ["tableflip"]);
    assert.ok(suggestCommands("/").length >= 7);
    assert.deepEqual(suggestCommands("/me "), []);
    assert.deepEqual(suggestCommands("/g", (c) => c.name !== "gif"), []);
  });
});

describe("custom emoji names", () => {
  it("are 2–32 lowercase letters, digits or underscores", () => {
    assert.equal(isEmojiName("party_parrot"), true);
    assert.equal(isEmojiName("a"), false);
    assert.equal(isEmojiName("Party"), false);
    assert.equal(isEmojiName("x".repeat(33)), false);
  });

  it("are read from :name: reactions", () => {
    assert.equal(customEmojiName(":party:"), "party");
    assert.equal(customEmojiName("👍"), undefined);
    assert.equal(customEmojiName(":Bad:"), undefined);
  });

  it("webhook URLs carry the id and token", () => {
    assert.equal(webhookUrl("https://chat.example", "abc123def456", "tok"), "https://chat.example/api/webhooks/abc123def456/tok");
  });
});
