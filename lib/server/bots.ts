// Slash commands and group bots: running commands, calling bots, posting their answers.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { randomUUID } from "node:crypto";
import { callBot } from "../chat/botFetch.ts";
import { COMMANDS as COMPOSER_COMMANDS } from "../chat/commands.ts";
import type { BotRequest, ManagedBot, Message, Subgroup } from "../chat/types";
import {
  cleanBotCommands,
  DEFAULT_BOT_ID,
  defaultCommandNames,
  executeCommand,
  findDefaultCommand,
} from "../commands/index.ts";
import { parseArgs, parseInvocation } from "../commands/parse.ts";
import type { CommandContext, CommandInfo } from "../commands/types.ts";
import { MAX_MESSAGE_LENGTH, MAX_NOTICE_LENGTH } from "./constants.ts";
import { db } from "./db.ts";
import { limiter } from "./limits.ts";
import { toMessage } from "./messages.ts";
import { afterPost, announce } from "./posting.ts";
import { botMemberId, botsByGroup, members, type BotRow, type MessageRow } from "./state.ts";
import { usersByIds } from "./users.ts";

// ---------------------------------------------------------------------------
// Slash commands: text like "/roll 2d6" is run before it's posted (see
// "message:send"). The default commands (lib/commands) are answered by the
// instance's bot; a group's bots answer their own, over signed HTTPS (see
// lib/chat/types/bots.ts). If a command refuses, nothing is posted and the
// sender sees why; otherwise the answer is posted as a reply, from the bot.
// ---------------------------------------------------------------------------

// Mirror lib/chat/types/bots.ts.
export const BOT_TIMEOUT = 3000;

export const MAX_BOTS_PER_GROUP = 10;

export const canCommand = limiter(5, 0.5);

 // per member, so nobody can flood a bot through the chat
export const canManageBots = limiter(5, 0.1);

 // adding and refreshing call out to the bot

/** Names a group bot can't take: the default commands' (and aliases) and the composer's own. */
export const RESERVED_COMMANDS = [...defaultCommandNames(), ...COMPOSER_COMMANDS.map((command) => command.name)];

export type Invocation =
  | { kind: "default"; name: string; input: string; command: NonNullable<ReturnType<typeof findDefaultCommand>> }
  | { kind: "bot"; name: string; input: string; command: CommandInfo; bot: BotRow };

/** The command this text runs in the channel, if it runs one (default commands win over bots'). */
export function invocationFor(channel: Subgroup, text: string): Invocation | null {
  const parsed = parseInvocation(text);
  if (!parsed) return null;
  const command = findDefaultCommand(parsed.name);
  if (command) return { kind: "default", ...parsed, command };
  for (const bot of botsByGroup.get(channel.groupId) ?? []) {
    const declared = bot.commands.find((c) => c.name === parsed.name);
    if (declared) return { kind: "bot", ...parsed, command: declared, bot };
  }
  return null;
}

/** Who answers (a bot member) and what, or why the command refused. */
export type CommandOutcome = { ok: true; authorId: string; text: string } | { ok: false; error: string };

/** Run a command for the message `messageId` that's about to be posted. */
export async function runInvocation(
  invocation: Invocation,
  context: CommandContext,
  messageId: string,
  threadId: string | null,
): Promise<CommandOutcome> {
  if (invocation.kind === "default") {
    try {
      const result = await executeCommand(invocation.command, invocation.input, context);
      return result.ok ? { ok: true, authorId: DEFAULT_BOT_ID, text: result.text.slice(0, MAX_MESSAGE_LENGTH) } : result;
    } catch (error) {
      console.error(`/${invocation.name} failed:`, error instanceof Error ? error.message : error);
      return { ok: false, error: `/${invocation.name} didn't work. Try again.` };
    }
  }
  const { bot, command } = invocation;
  const parsed = parseArgs(command, invocation.input);
  if (!parsed.ok) return parsed;
  const request: BotRequest = {
    type: "command",
    id: messageId,
    command: command.name,
    options: parsed.args as Record<string, string | number | boolean>,
    text: invocation.input,
    ...context,
    ...(threadId && { threadId }),
  };
  const reply = await callBot(bot.url, bot.secret, request, BOT_TIMEOUT);
  if (!reply.ok) {
    console.error(`bot ${bot.id} /${command.name} failed: ${reply.reason}${reply.status ? ` ${reply.status}` : ""}`);
    return {
      ok: false,
      error: reply.reason === "timeout"
        ? `${bot.name} didn't answer in time. Try again.`
        : `${bot.name} couldn't run /${command.name} right now.`,
    };
  }
  const body = (reply.body ?? {}) as { content?: unknown; error?: unknown };
  if (typeof body.error === "string" && body.error.trim()) {
    return { ok: false, error: `${bot.name}: ${body.error.trim().slice(0, MAX_NOTICE_LENGTH)}` };
  }
  const text = typeof body.content === "string" ? body.content.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  return { ok: true, authorId: botMemberId(bot.id), text };
}

/** Post a command's answer as a reply to the message that ran it (in its thread, if it's in one). */
export async function postAnswer(authorId: string, text: string, channel: Subgroup, invoked: Message, root: MessageRow | null) {
  if (!members.has(authorId)) await usersByIds([authorId]);
  const { data, error } = await db.from("messages")
    .insert({
      id: randomUUID(),
      channel_id: channel.id,
      author_id: authorId,
      body: text,
      attachments: [{ type: "reply", messageId: invoked.id }],
      thread_id: invoked.threadId ?? null,
    })
    .select("*").single();
  if (error || !data) {
    console.error("command answer failed:", error?.message);
    return;
  }
  const message = toMessage(data as MessageRow);
  announce(message, channel);
  await afterPost(message, channel, { replyTo: invoked.authorId, root });
}

export function findBot(id: unknown) {
  if (typeof id !== "string" || !/^[a-z0-9]{12}$/.test(id)) return undefined;
  for (const list of botsByGroup.values()) {
    const bot = list.find((b) => b.id === id);
    if (bot) return bot;
  }
  return undefined;
}

/** A bot as those who manage its group see it. */
export function toManagedBot(row: BotRow): ManagedBot {
  return {
    id: row.id,
    userId: botMemberId(row.id),
    groupId: row.group_id,
    name: row.name,
    url: row.url,
    commands: row.commands,
    createdAt: Date.parse(row.created_at),
    ...(row.created_by && { createdBy: row.created_by }),
  };
}

/**
 * Ask the bot for its commands, cleaned (names taken by the default commands
 * or the group's other bots are skipped); `error` when it couldn't be asked.
 */
export async function fetchManifest(bot: Pick<BotRow, "id" | "group_id" | "url" | "secret">) {
  const reply = await callBot(bot.url, bot.secret, { type: "manifest" }, BOT_TIMEOUT);
  if (!reply.ok) {
    const why = reply.reason === "timeout" ? "didn't answer in time"
      : reply.reason === "status" ? `answered ${reply.status}`
      : reply.reason === "invalid" ? "didn't answer with JSON"
      : "couldn't be reached";
    return { error: `The bot ${why}.` };
  }
  const others = (botsByGroup.get(bot.group_id) ?? []).filter((b) => b.id !== bot.id).flatMap((b) => b.commands.map((c) => c.name));
  return cleanBotCommands((reply.body as { commands?: unknown } | null)?.commands, [...RESERVED_COMMANDS, ...others]);
}
