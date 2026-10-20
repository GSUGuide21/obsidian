import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";
import { botUrl, signature } from "../lib/chat/botFetch.ts";
import { serverCommands, suggestCommands } from "../lib/chat/commands.ts";
import { cleanBotCommands, DEFAULT_COMMANDS, executeCommand, findDefaultCommand } from "../lib/commands/index.ts";
import { parseArgs, parseInvocation, usage } from "../lib/commands/parse.ts";
import { parseDice } from "../lib/commands/roll.ts";
import type { CommandContext, CommandInfo } from "../lib/commands/types.ts";

const context: CommandContext = {
  user: { id: "u1", name: "Ada" },
  channel: { id: "c1", name: "general" },
  group: { id: "g1", name: "HQ" },
};

/** Run a default command by name, as the server does. */
async function run(text: string) {
  const invocation = parseInvocation(text);
  assert.ok(invocation, `${text} is a command`);
  const command = findDefaultCommand(invocation.name);
  assert.ok(command, `/${invocation.name} is a default command`);
  return executeCommand(command, invocation.input, context);
}

/** Math.random answers these in turn (each in [0, 1)). */
function randomSequence(...values: number[]) {
  let index = 0;
  mock.method(Math, "random", () => values[index++ % values.length]);
}

afterEach(() => mock.restoreAll());

describe("parsing commands", () => {
  it("splits the name from the rest", () => {
    assert.deepEqual(parseInvocation("/Roll  2d6 "), { name: "roll", input: "2d6" });
    assert.deepEqual(parseInvocation("/8ball"), { name: "8ball", input: "" });
    assert.equal(parseInvocation("/usr/bin"), null);
    assert.equal(parseInvocation("hi /roll"), null);
  });

  const command: CommandInfo = {
    name: "deploy",
    description: "Ship it",
    options: [
      { name: "env", description: "", type: "string", required: true, choices: ["Staging", "Production"] },
      { name: "count", description: "", type: "integer", min: 1, max: 5 },
      { name: "force", description: "", type: "boolean" },
      { name: "note", description: "", type: "string", rest: true },
    ],
  };

  it("reads options in order, with types", () => {
    assert.deepEqual(parseArgs(command, "production 3 yes ship it now"), {
      ok: true,
      args: { env: "Production", count: 3, force: true, note: "ship it now" },
    });
    assert.deepEqual(parseArgs(command, "staging"), { ok: true, args: { env: "Staging" } });
  });

  it("keeps quoted words together", () => {
    const say: CommandInfo = { name: "say", description: "", options: [{ name: "a", description: "", type: "string" }, { name: "b", description: "", type: "string" }] };
    assert.deepEqual(parseArgs(say, `"hello there" 'and you'`), { ok: true, args: { a: "hello there", b: "and you" } });
  });

  it("explains what's wrong, with the usage", () => {
    const fail = (input: string) => {
      const result = parseArgs(command, input);
      assert.equal(result.ok, false);
      return result.ok ? "" : result.error;
    };
    assert.match(fail(""), /^Missing `env`/);
    assert.match(fail("dev"), /must be one of: Staging, Production/);
    assert.match(fail("staging 9"), /at most 5/);
    assert.match(fail("staging 1.5"), /whole number/);
    assert.match(fail("staging 2 maybe"), /yes or no/);
    assert.ok(fail("").endsWith(usage(command)));
    assert.equal(usage(command), "Usage: `/deploy <env> [count] [force] [note]`");
    const extra = parseArgs({ ...command, options: command.options!.slice(0, 1) }, "staging extra");
    assert.ok(!extra.ok && extra.error.startsWith("Too many arguments."));
  });
});

describe("default commands", () => {
  it("every one has a unique name and alias", () => {
    const names = DEFAULT_COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
    assert.equal(new Set(names).size, names.length);
  });

  it("/roll reads dice notation", () => {
    assert.deepEqual(parseDice("2d6+3"), { count: 2, sides: 6, modifier: 3 });
    assert.deepEqual(parseDice("d20"), { count: 1, sides: 20, modifier: 0 });
    assert.deepEqual(parseDice("12"), { count: 1, sides: 12, modifier: 0 });
    assert.deepEqual(parseDice("3d8 - 2"), { count: 3, sides: 8, modifier: -2 });
    assert.equal(parseDice("two dice"), null);
  });

  it("/roll stays within the dice", async () => {
    randomSequence(0, 0.999999);
    assert.deepEqual(await run("/roll 2d6 + 3"), { ok: true, text: "🎲 Rolled 2d6+3: 1 + 6 + 3 = **10**" });
    randomSequence(0.999999);
    assert.deepEqual(await run("/roll"), { ok: true, text: "🎲 Rolled a d6: **6**" });
    assert.deepEqual(await run("/dice d20"), { ok: true, text: "🎲 Rolled a d20: **20**" });
  });

  it("/roll refuses impossible dice", async () => {
    assert.equal((await run("/roll 0d6")).ok, false);
    assert.equal((await run("/roll 1d1")).ok, false);
    assert.equal((await run("/roll 500d6")).ok, false);
    assert.equal((await run("/roll lots")).ok, false);
  });

  it("/coin flips one or several", async () => {
    randomSequence(0.1, 0.9, 0.2);
    assert.deepEqual(await run("/flip"), { ok: true, text: "🪙 Flipped a coin: **heads**" });
    assert.deepEqual(await run("/coin 2"), { ok: true, text: "🪙 Flipped 2 coins: tails, heads (**1** heads, **1** tails)" });
    assert.equal((await run("/coin 50")).ok, false);
  });

  it("/choose picks one of the options", async () => {
    randomSequence(0.99);
    assert.deepEqual(await run("/choose pizza, tacos | sushi"), { ok: true, text: "🤔 I choose **sushi**" });
    assert.equal((await run("/choose pizza")).ok, false);
    assert.equal((await run("/choose pizza, PIZZA")).ok, false);
    assert.equal((await run("/choose")).ok, false);
  });

  it("/8ball needs a question", async () => {
    randomSequence(0);
    assert.deepEqual(await run("/8ball will it rain?"), { ok: true, text: "🎱 It is certain." });
    assert.equal((await run("/8ball")).ok, false);
  });

  it("/random takes a top, or a range", async () => {
    randomSequence(0.999999);
    assert.deepEqual(await run("/random"), { ok: true, text: "🔢 Picked a number from 1 to 100: **100**" });
    assert.deepEqual(await run("/rng 20"), { ok: true, text: "🔢 Picked a number from 1 to 20: **20**" });
    randomSequence(0);
    assert.deepEqual(await run("/random -5 5"), { ok: true, text: "🔢 Picked a number from -5 to 5: **-5**" });
    assert.equal((await run("/random 5 5")).ok, false);
  });
});

describe("bot commands", () => {
  it("keeps valid commands, cleaned", () => {
    const { commands, skipped } = cleanBotCommands(
      [
        {
          name: "Deploy",
          description: "  Ship   it  ",
          options: [{ name: "env", type: "string", required: true, choices: ["a", "a", "b"] }, { name: "why", type: "string", rest: true }],
          extra: "dropped",
        },
        { name: "status" },
      ],
      [],
    );
    assert.deepEqual(skipped, []);
    assert.deepEqual(commands, [
      {
        name: "deploy",
        description: "Ship it",
        options: [
          { name: "env", description: "", type: "string", required: true, choices: ["a", "b"] },
          { name: "why", description: "", type: "string", rest: true },
        ],
      },
      { name: "status", description: "Runs /status" },
    ]);
  });

  it("skips taken names and broken commands, saying why", () => {
    const { commands, skipped } = cleanBotCommands(
      [
        { name: "roll" },
        { name: "has space" },
        { name: "late", options: [{ name: "all", type: "string", rest: true }, { name: "after", type: "string" }] },
        { name: "typeless", options: [{ name: "x" }] },
        { name: "twice", options: [{ name: "x", type: "number" }, { name: "x", type: "number" }] },
        { name: "ok" },
        { name: "ok" },
      ],
      ["roll"],
    );
    assert.deepEqual(commands.map((c) => c.name), ["ok"]);
    assert.equal(skipped.length, 6);
    assert.match(skipped[0], /^\/roll: that name is already taken/);
    assert.match(skipped[2], /must come last/);
    assert.match(skipped[5], /^\/ok: that name is already taken/);
  });

  it("are suggested with the bot that answers them", () => {
    const group = { bots: [{ id: "abc", userId: "bot-abc", name: "Deployer", commands: [{ name: "deploy", description: "Ship it", options: [{ name: "env", description: "", type: "string" as const, required: true }] }] }] };
    const extra = serverCommands(group, "Obsidian");
    assert.deepEqual(
      suggestCommands("/de", undefined, extra),
      [{ name: "deploy", description: "Ship it", bot: "Deployer", args: "<env>" }],
    );
    assert.deepEqual(suggestCommands("/ro", undefined, extra).map((c) => [c.name, c.bot, c.args]), [["roll", "Obsidian", "[dice]"]]);
    assert.deepEqual(suggestCommands("/8", undefined, extra).map((c) => c.name), ["8ball"]);
  });

  it("requests are signed with HMAC-SHA256 of the timestamp and body", () => {
    const expected = createHmac("sha256", "s3cret").update("1700000000000.{\"type\":\"manifest\"}").digest("hex");
    assert.equal(signature("s3cret", "1700000000000", '{"type":"manifest"}'), `sha256=${expected}`);
  });

  it("only live at public https URLs", () => {
    assert.equal(botUrl("https://bot.example.com/hook"), "https://bot.example.com/hook");
    assert.equal(botUrl("http://bot.example.com/hook"), undefined);
    assert.equal(botUrl("https://bot.example.com:8443/hook"), undefined);
    assert.equal(botUrl("https://127.0.0.1/hook"), undefined);
    assert.equal(botUrl("https://user:pw@bot.example.com/"), undefined);
    assert.equal(botUrl("not a url"), undefined);
  });
});
