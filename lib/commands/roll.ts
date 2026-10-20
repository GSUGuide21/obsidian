import { randomInt } from "../utils/random.ts";
import { range } from "../utils/range.ts";
import { CommandError, defineCommand } from "./types.ts";

const MAX_DICE = 100;
const MAX_SIDES = 1000;
const MAX_MODIFIER = 1000;
/** Show each die up to this many; past it, just the total. */
const MAX_SHOWN = 20;

export type Dice = { count: number; sides: number; modifier: number };

/** "2d6+3", "d20" or "20" (one die with that many sides); null when it isn't dice. */
export function parseDice(notation: string): Dice | null {
  const match = /^(?:(\d*)d)?(\d+)([+-]\d+)?$/i.exec(notation.replace(/\s+/g, ""));
  if (!match) return null;
  return { count: match[1] ? Number(match[1]) : 1, sides: Number(match[2]), modifier: Number(match[3] ?? 0) };
}

export default defineCommand<{ dice?: string }>({
  name: "roll",
  description: "Roll dice, like 2d6+3",
  aliases: ["dice"],
  options: [
    { name: "dice", description: "How many dice, how many sides, plus or minus (default 1d6)", type: "string", rest: true, max: 30 },
  ],
  execute: ({ dice: notation = "1d6" }) => {
    const dice = parseDice(notation);
    if (!dice) throw new CommandError(`\`${notation}\` isn't dice. Try \`2d6\`, \`d20\` or \`3d8+2\`.`);
    const { count, sides, modifier } = dice;
    if (count < 1 || count > MAX_DICE) throw new CommandError(`Roll 1–${MAX_DICE} dice at a time.`);
    if (sides < 2 || sides > MAX_SIDES) throw new CommandError(`Dice have 2–${MAX_SIDES} sides.`);
    if (Math.abs(modifier) > MAX_MODIFIER) throw new CommandError(`Add or subtract at most ${MAX_MODIFIER}.`);

    const rolls = [...range(count)].map(() => randomInt(1, sides, true));
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
    const name = `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`;
    if (count === 1 && !modifier) return `🎲 Rolled a d${sides}: **${total}**`;
    const shown = count <= MAX_SHOWN ? rolls.join(" + ") : `${count} dice`;
    const extra = modifier ? ` ${modifier > 0 ? "+" : "−"} ${Math.abs(modifier)}` : "";
    return `🎲 Rolled ${name}: ${shown}${extra} = **${total}**`;
  },
});
