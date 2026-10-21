import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkChannels } from "../lib/chat/channelLinks.ts";

const channels = [
  { id: "g-general", name: "general" },
  { id: "g-game", name: "Game" },
  { id: "g-game-night", name: "Game Night" },
];

describe("linkChannels", () => {
  it("links #name to the channel", () => {
    assert.equal(linkChannels("see #general", channels, "channel:"), "see [#general](channel:g-general)");
  });

  it("prefers the longest name, and matches regardless of case", () => {
    assert.equal(
      linkChannels("join #game night!", channels, "channel:"),
      "join [#Game Night](channel:g-game-night)!",
    );
  });

  it("only links whole names at a word's start", () => {
    assert.equal(linkChannels("#generally speaking", channels, "channel:"), "#generally speaking");
    assert.equal(linkChannels("issue#general", channels, "channel:"), "issue#general");
  });

  it("leaves unknown channels and headings alone", () => {
    assert.equal(linkChannels("#random", channels, "channel:"), "#random");
    assert.equal(linkChannels("# Title", channels, "channel:"), "# Title");
  });
});
