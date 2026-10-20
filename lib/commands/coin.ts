import { choice } from "../utils/choice.ts";
import { range } from "../utils/range.ts";
import { defineCommand } from "./types.ts";

const outcomes = ["heads", "tails"];
const MAX_FLIPS = 20;

export default defineCommand<{ count?: number }>({
  name: "coin",
  description: "Flip a coin: heads or tails",
  aliases: ["flip", "toss"],
  options: [{ name: "count", description: `How many coins (1–${MAX_FLIPS})`, type: "integer", min: 1, max: MAX_FLIPS }],
  execute: ({ count = 1 }) => {
    const flips = [...range(count)].map(() => choice(outcomes));
    if (count === 1) return `🪙 Flipped a coin: **${flips[0]}**`;
    const heads = flips.filter((flip) => flip === "heads").length;
    return `🪙 Flipped ${count} coins: ${flips.join(", ")} (**${heads}** heads, **${count - heads}** tails)`;
  },
});
