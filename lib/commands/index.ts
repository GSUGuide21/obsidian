// The default slash commands: every chat has them, and the instance's own bot
// (the "obsidian" member) answers them. Group bots add their own (see
// lib/chat/types/bots.ts); a name used here can't be taken by a bot.

import eightBall from "./8ball.ts";
import choose from "./choose.ts";
import coin from "./coin.ts";
import random from "./random.ts";
import { parseArgs } from "./parse.ts";
import roll from "./roll.ts";
import {
  COMMAND_NAME,
  CommandError,
  type CommandContext,
  type CommandDefinition,
  type CommandInfo,
  type CommandOption,
  type OptionType,
} from "./types.ts";

export const DEFAULT_COMMANDS: CommandDefinition[] = [roll, coin, choose, eightBall, random];

/** The member that answers the default commands. */
export const DEFAULT_BOT_ID = "obsidian";

/** A default command by its name or one of its aliases. */
export function findDefaultCommand(name: string) {
  return DEFAULT_COMMANDS.find((command) => command.name === name || command.aliases?.includes(name));
}

/** Every name and alias the default commands use. */
export function defaultCommandNames() {
  return DEFAULT_COMMANDS.flatMap((command) => [command.name, ...(command.aliases ?? [])]);
}

/**
 * Run a command on the text after its name: its answer, or why it refused
 * (bad arguments, or a CommandError from the handler). Other errors throw.
 */
export async function executeCommand(
  command: CommandDefinition,
  input: string,
  context: CommandContext,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const parsed = parseArgs(command, input);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, text: (await command.execute(parsed.args, context)).trim() };
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.message };
    throw error;
  }
}

/** What clients are told about a command (no handler). */
export function describeCommand({ name, description, options }: CommandInfo): CommandInfo {
  return { name, description, ...(options && options.length > 0 && { options }) };
}

// ---------------------------------------------------------------------------
// What a bot says its commands are, checked before it's kept.
// ---------------------------------------------------------------------------

export const MAX_BOT_COMMANDS = 25;
export const MAX_COMMAND_OPTIONS = 10;
const MAX_DESCRIPTION = 100;
const MAX_CHOICES = 25;
const TYPES: OptionType[] = ["string", "integer", "number", "boolean"];

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function cleanOption(raw: unknown, last: boolean): CommandOption | string {
  const option = (raw ?? {}) as Record<string, unknown>;
  const name = text(option.name, 32).toLowerCase();
  if (!COMMAND_NAME.test(name)) return "option names are 1–32 lowercase letters, digits, - or _";
  const type = TYPES.find((t) => t === option.type);
  if (!type) return `option "${name}" needs a type: ${TYPES.join(", ")}`;
  const rest = option.rest === true && type === "string";
  if (rest && !last) return `option "${name}" takes the rest of the text, so it must come last`;
  const choices = type === "string" && Array.isArray(option.choices)
    ? [...new Set(option.choices.map((c) => text(c, 50)).filter(Boolean))].slice(0, MAX_CHOICES)
    : [];
  const [min, max] = [finite(option.min), finite(option.max)];
  return {
    name,
    description: text(option.description, MAX_DESCRIPTION),
    type,
    ...(option.required === true && { required: true }),
    ...(rest && { rest: true }),
    ...(min !== undefined && { min }),
    ...(max !== undefined && { max }),
    ...(choices.length > 0 && { choices }),
  };
}

/**
 * A bot's commands as kept: valid ones only, each name once and not one of
 * `taken` (the default commands, the composer's own, other bots' in the
 * group). `skipped` says what was left out, and why.
 */
export function cleanBotCommands(raw: unknown, taken: Iterable<string>) {
  const used = new Set(taken);
  const commands: CommandInfo[] = [];
  const skipped: string[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const command = (entry ?? {}) as Record<string, unknown>;
    const name = text(command.name, 32).toLowerCase();
    if (!COMMAND_NAME.test(name)) {
      skipped.push(`"${String(command.name).slice(0, 32)}": names are 1–32 lowercase letters, digits, - or _`);
      continue;
    }
    if (used.has(name)) {
      skipped.push(`/${name}: that name is already taken here`);
      continue;
    }
    if (commands.length >= MAX_BOT_COMMANDS) {
      skipped.push(`/${name}: a bot can have up to ${MAX_BOT_COMMANDS} commands`);
      continue;
    }
    const rawOptions = Array.isArray(command.options) ? command.options : [];
    if (rawOptions.length > MAX_COMMAND_OPTIONS) {
      skipped.push(`/${name}: commands can have up to ${MAX_COMMAND_OPTIONS} options`);
      continue;
    }
    const options = rawOptions.map((option, index) => cleanOption(option, index === rawOptions.length - 1));
    const problem = options.find((option) => typeof option === "string");
    const names = options.flatMap((option) => (typeof option === "string" ? [] : [option.name]));
    if (problem || new Set(names).size !== names.length) {
      skipped.push(`/${name}: ${problem ?? "option names must be different"}`);
      continue;
    }
    used.add(name);
    commands.push(describeCommand({
      name,
      description: text(command.description, MAX_DESCRIPTION) || `Runs /${name}`,
      options: options as CommandOption[],
    }));
  }
  return { commands, skipped };
}
