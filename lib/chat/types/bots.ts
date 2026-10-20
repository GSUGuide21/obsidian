import type { CommandInfo } from "../../commands/types";

/**
 * A group's bot: an outside service that answers slash commands. When someone
 * runs one of its commands, the server POSTs a signed interaction to its URL
 * and posts the answer as a reply, from the bot's own member (`userId`).
 *
 * Every request carries `X-Obsidian-Timestamp` (ms) and `X-Obsidian-Signature:
 * sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<body>` with the bot's secret
 * (shown once, when it's added). Bodies are JSON (see BotRequest); answers
 * are JSON too (see BotResponse), within BOT_TIMEOUT.
 */
export type GroupBot = {
  id: string;
  /** The member it posts as: "bot-<id>". */
  userId: string;
  name: string;
  commands: CommandInfo[];
};

/** What those who manage the group see. */
export type ManagedBot = GroupBot & {
  groupId: string;
  url: string;
  createdAt: number;
  createdBy?: string;
};

export type BotRequest =
  /** Asked when it's added and on "Refresh commands": answer with `{ commands }`. */
  | { type: "manifest" }
  | {
      type: "command";
      /** The id of the message that ran it (what the answer replies to). */
      id: string;
      command: string;
      /** Parsed by the server from the command's declared options. */
      options: Record<string, string | number | boolean>;
      /** The text after the command's name, as typed. */
      text: string;
      user: { id: string; name: string };
      channel: { id: string; name: string };
      group: { id: string; name: string };
      /** When it was run in a thread: the thread's root message. */
      threadId?: string;
    };

export type BotResponse =
  | { commands: CommandInfo[] }
  /** Posted as a reply (Markdown, up to MAX_MESSAGE_LENGTH); a 204 or empty content posts nothing. */
  | { content?: string }
  /** Refuse: nothing is posted, and whoever ran it sees this. */
  | { error: string };

/** How long a bot has to answer (ms). */
export const BOT_TIMEOUT = 3000;
export const MAX_BOTS_PER_GROUP = 10;

export type BotResult =
  | {
      ok: true;
      bot: ManagedBot;
      /** Only when it's added: the signing secret, never shown again. */
      secret?: string;
      /** Commands it declared that weren't kept, and why. */
      skipped: string[];
      /** Why its commands couldn't be fetched (it's kept, with none). */
      warning?: string;
    }
  | { ok: false; error: string };
