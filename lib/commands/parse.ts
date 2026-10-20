import type { CommandArgs, CommandInfo, CommandOption, OptionValue } from "./types.ts";

/** "/name rest…" split into the (lowercased) name and the text after it; null when it isn't one. */
export function parseInvocation(text: string): { name: string; input: string } | null {
  const match = /^\/([a-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), input: (match[2] ?? "").trim() } : null;
}

/** Words, with "double" or 'single' quotes keeping spaces together; each with where it ends in `input`. */
function tokenize(input: string) {
  const tokens: { value: string; end: number }[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (let match = pattern.exec(input); match; match = pattern.exec(input)) {
    tokens.push({ value: match[1] ?? match[2] ?? match[3], end: pattern.lastIndex });
  }
  return tokens;
}

const BOOLEANS: Record<string, boolean> = { true: true, yes: true, on: true, false: false, no: false, off: false };

/** One option's value from its text, or why it isn't valid. */
function parseValue(option: CommandOption, raw: string): { value: OptionValue } | { error: string } {
  const label = `\`${option.name}\``;
  switch (option.type) {
    case "boolean": {
      const value = BOOLEANS[raw.toLowerCase()];
      return value === undefined ? { error: `${label} must be yes or no.` } : { value };
    }
    case "integer":
    case "number": {
      const value = Number(raw);
      if (!raw || !Number.isFinite(value)) return { error: `${label} must be a number.` };
      if (option.type === "integer" && !Number.isInteger(value)) return { error: `${label} must be a whole number.` };
      if (option.min !== undefined && value < option.min) return { error: `${label} must be at least ${option.min}.` };
      if (option.max !== undefined && value > option.max) return { error: `${label} must be at most ${option.max}.` };
      return { value };
    }
    case "string": {
      if (option.choices) {
        const value = option.choices.find((choice) => choice.toLowerCase() === raw.toLowerCase());
        return value === undefined ? { error: `${label} must be one of: ${option.choices.join(", ")}.` } : { value };
      }
      if (option.min !== undefined && raw.length < option.min) {
        return { error: `${label} must be at least ${option.min} characters.` };
      }
      if (option.max !== undefined && raw.length > option.max) {
        return { error: `${label} must be at most ${option.max} characters.` };
      }
      return { value: raw };
    }
  }
}

export type ParseResult = { ok: true; args: CommandArgs } | { ok: false; error: string };

/** The command's arguments from the text after its name, in the order of its options. */
export function parseArgs(command: CommandInfo, input: string): ParseResult {
  const options = command.options ?? [];
  const tokens = tokenize(input);
  const args: CommandArgs = {};
  let used = 0;
  for (const option of options) {
    let raw: string | undefined;
    if (option.rest) {
      // Everything after the earlier options, as typed.
      const start = used > 0 ? tokens[used - 1].end : 0;
      raw = input.slice(start).trim() || undefined;
      used = tokens.length;
    } else {
      raw = tokens[used]?.value;
      if (raw !== undefined) used++;
    }
    if (raw === undefined) {
      if (option.required) return { ok: false, error: `Missing \`${option.name}\`. ${usage(command)}` };
      continue;
    }
    const parsed = parseValue(option, raw);
    if ("error" in parsed) return { ok: false, error: `${parsed.error} ${usage(command)}` };
    args[option.name] = parsed.value;
  }
  if (used < tokens.length) return { ok: false, error: `Too many arguments. ${usage(command)}` };
  return { ok: true, args };
}

/** "Usage: /roll [dice]" (required options in <angle brackets>). */
export function usage(command: CommandInfo) {
  return `Usage: \`/${[command.name, ...argumentHint(command)].join(" ")}\``;
}

/** The options as shown after a command's name in suggestions: "<question>", "[min] [max]". */
export function argumentHint(command: CommandInfo) {
  return (command.options ?? []).map((option) => (option.required ? `<${option.name}>` : `[${option.name}]`));
}
