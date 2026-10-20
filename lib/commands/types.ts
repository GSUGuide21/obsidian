// Slash commands that run on the server and are answered by a bot: the
// default ones (lib/commands) and the ones group bots declare. Shared by the
// client (suggestions) and server.mts (which imports these files by path, so
// they only `import type` from the app and use `.ts` extensions).

export type OptionType = "string" | "integer" | "number" | "boolean";

/** One argument of a command, given in order after its name: `/roll 2d6`. */
export type CommandOption = {
  name: string;
  description: string;
  type: OptionType;
  required?: boolean;
  /** Strings only: takes the rest of the text, spaces and all. Last option only. */
  rest?: boolean;
  /** Numbers: the smallest and largest allowed. Strings: their length. */
  min?: number;
  max?: number;
  /** Strings only: the values allowed (matched ignoring case). */
  choices?: string[];
};

export type OptionValue = string | number | boolean;

export type CommandArgs = Record<string, OptionValue | undefined>;

/** What clients are told about a command, and what bots declare. */
export type CommandInfo = {
  name: string;
  description: string;
  options?: CommandOption[];
};

/** Who ran a command, and where. */
export type CommandContext = {
  user: { id: string; name: string };
  channel: { id: string; name: string };
  group: { id: string; name: string };
};

/** The bot's answer (Markdown), posted as a reply to the command; empty for none. */
export type CommandHandler<T extends CommandArgs = CommandArgs> = (
  args: T,
  context: CommandContext,
) => string | Promise<string>;

export type CommandDefinition<T extends CommandArgs = CommandArgs> = CommandInfo & {
  /** Other names it answers to (not suggested). */
  aliases?: string[];
  execute: CommandHandler<T>;
};

/** Thrown by a handler to refuse with a message for whoever ran it (nothing is posted). */
export class CommandError extends Error {}

/** Command names: 1–32 lowercase letters, digits, dashes or underscores. */
export const COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;

/** Gives `execute` its argument types while keeping the definition a plain object. */
export function defineCommand<T extends CommandArgs>(definition: CommandDefinition<T>) {
  return definition as unknown as CommandDefinition;
}
