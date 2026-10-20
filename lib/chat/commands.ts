// Slash commands typed in the message box. The composer's own (below) change
// the text or open a dialog, here in the browser. The rest are sent as typed
// and run by the server: the default ones (lib/commands) and the group's bots'
// (answered by the bot, in a reply). Text starting with "/" that isn't a
// command is sent as written (so "/usr/bin" still works).

import { argumentHint } from "../commands/parse.ts";
import { DEFAULT_COMMANDS, describeCommand } from "../commands/index.ts";
import type { CommandInfo } from "../commands/types";
import type { Group } from "./types";

export type Command = {
  name: string;
  args?: string;
  description: string;
  /** Who answers it, for commands the server runs: the bot's name. */
  bot?: string;
};

export const COMMANDS: Command[] = [
  { name: "me", args: "action", description: "Say what you're doing, in italics" },
  { name: "shrug", args: "message", description: "Append ¯\\_(ツ)_/¯" },
  { name: "tableflip", args: "message", description: "Append (╯°□°)╯︵ ┻━┻" },
  { name: "unflip", args: "message", description: "Append ┬─┬ノ( º _ ºノ)" },
  { name: "gif", args: "search", description: "Find a GIF" },
  { name: "poll", description: "Create a poll" },
  { name: "event", description: "Create an event" },
];

export type CommandResult =
  /** Send this text instead. */
  | { kind: "send"; text: string }
  /** Open a dialog (the GIF picker searching for `query`). */
  | { kind: "open"; dialog: "gif" | "poll" | "event"; query?: string };

// Escaped for Markdown, so the backslash and underscores show as typed.
const SHRUG = "¯\\\\\\_(ツ)\\_/¯";

/** What a message box's text does, if it's one of the composer's commands; null to send it as written. */
export function runCommand(input: string): CommandResult | null {
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(input.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  const rest = (match[2] ?? "").trim();
  const append = (suffix: string) => ({ kind: "send" as const, text: rest ? `${rest} ${suffix}` : suffix });
  switch (name) {
    case "me":
      return rest ? { kind: "send", text: `_${rest}_` } : null;
    case "shrug":
      return append(SHRUG);
    case "tableflip":
      return append("(╯°□°)╯︵ ┻━┻");
    case "unflip":
      return append("┬─┬ノ( º _ ºノ)");
    case "gif":
      return { kind: "open", dialog: "gif", ...(rest && { query: rest }) };
    case "poll":
    case "event":
      return { kind: "open", dialog: name };
    default:
      return null;
  }
}

function toCommand(info: CommandInfo, bot: string): Command {
  const args = argumentHint(info).join(" ");
  return { name: info.name, description: info.description, bot, ...(args && { args }) };
}

/** The commands the server runs in a channel of this group: the default ones, then its bots'. */
export function serverCommands(group: Pick<Group, "bots"> | undefined, defaultBot = "Obsidian"): Command[] {
  return [
    ...DEFAULT_COMMANDS.map((command) => toCommand(describeCommand(command), defaultBot)),
    ...(group?.bots ?? []).flatMap((bot) => bot.commands.map((command) => toCommand(command, bot.name))),
  ];
}

/** Commands to suggest while typing "/na…" (before any space): the composer's, then `extra`. */
export function suggestCommands(
  input: string,
  available: (command: Command) => boolean = () => true,
  extra: Command[] = [],
) {
  const match = /^\/([a-z0-9_-]*)$/i.exec(input);
  if (!match) return [];
  const typed = match[1].toLowerCase();
  return [...COMMANDS, ...extra].filter((command) => command.name.startsWith(typed) && available(command));
}
