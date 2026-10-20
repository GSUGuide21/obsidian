import { choice } from "../utils/choice.ts";
import { defineCommand } from "./types.ts";

// The classic twenty: ten yes, five maybe, five no.
const answers = [
  "It is certain.",
  "It is decidedly so.",
  "Without a doubt.",
  "Yes, definitely.",
  "You may rely on it.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
];

export default defineCommand<{ question: string }>({
  name: "8ball",
  description: "Ask the magic 8-ball a yes-or-no question",
  aliases: ["eightball"],
  options: [{ name: "question", description: "What you want to know", type: "string", rest: true, required: true, max: 300 }],
  execute: () => `🎱 ${choice(answers)}`,
});
