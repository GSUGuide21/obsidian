import { randomInt } from "../utils/random.ts";
import { CommandError, defineCommand } from "./types.ts";

const LIMIT = 1_000_000_000;

export default defineCommand<{ min?: number; max?: number }>({
  name: "random",
  description: "A random whole number (1–100 by default)",
  aliases: ["rng"],
  options: [
    { name: "min", description: "The smallest it can be, or the largest when it's the only one given", type: "integer", min: -LIMIT, max: LIMIT },
    { name: "max", description: "The largest it can be", type: "integer", min: -LIMIT, max: LIMIT },
  ],
  execute: (args) => {
    // One number is the top of the range ("/random 20" is 1–20), like most chat bots.
    const [min, max] = args.max === undefined ? [1, args.min ?? 100] : [args.min ?? 1, args.max];
    if (min >= max) throw new CommandError(`Pick a range where the smallest is below the largest (got ${min}–${max}).`);
    return `🔢 Picked a number from ${min} to ${max}: **${randomInt(min, max, true)}**`;
  },
});
