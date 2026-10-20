import { choice } from "../utils/choice.ts";
import { CommandError, defineCommand } from "./types.ts";

export default defineCommand<{ options: string }>({
  name: "choose",
  description: "Pick one of a few options",
  aliases: ["pick"],
  options: [
    { name: "options", description: "Separated by commas or |, like pizza, tacos", type: "string", rest: true, required: true, max: 500 },
  ],
  execute: ({ options }) => {
    const picks = options.split(/[,|]/).map((option) => option.trim()).filter(Boolean);
    if (new Set(picks.map((pick) => pick.toLowerCase())).size < 2) {
      throw new CommandError("Give at least two options, separated by commas: `/choose pizza, tacos`.");
    }
    return `🤔 I choose **${choice(picks)}**`;
  },
});
