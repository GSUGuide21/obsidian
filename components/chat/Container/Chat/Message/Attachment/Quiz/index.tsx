"use client";

import { useState } from "react";
import { Check, ListChecks, X } from "lucide-react";
import { formatDateTime } from "@/lib/chat/format";
import type { QuizAnswer, QuizAttachment } from "@/lib/chat/types";
import { useUntil } from "@/lib/hooks/useUntil";
import { cn } from "@/lib/utils";
import { card } from "../styles";

/** Answering a quiz: your answer once you've given one, and giving it (resolves to an error message). */
export type QuizContext = {
  answer?: QuizAnswer;
  onAnswer: (option: number) => Promise<string | undefined>;
};

/**
 * A quiz. The server keeps its answer: you pick once, it grades it, and only
 * then do you see whether you were right. Once it closes (`closesAt`) nobody
 * can answer, and the answer is shown to everyone. Without `quiz` (still
 * sending) it can't be answered yet.
 */
export default function Quiz({ attachment, quiz }: { attachment: QuizAttachment; quiz?: QuizContext }) {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const answer = quiz?.answer;
  const answered = answer !== undefined;
  const correct = answered && answer.option === answer.correct;
  const open = useUntil(attachment.closesAt);
  const closed = attachment.closesAt !== undefined && !open;
  // Closed: the server sends the answer along (until then it keeps it to itself).
  const revealed = !answered && closed ? attachment.options.indexOf(attachment.correctAnswer ?? "") : -1;

  async function pick(option: number) {
    if (!quiz || answered || closed || pending !== null) return;
    setPending(option);
    setError(undefined);
    setError(await quiz.onAnswer(option));
    setPending(null);
  }

  return (
    <fieldset className={card} aria-busy={pending !== null}>
      <legend className="sr-only">Quiz: {attachment.question}</legend>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        <ListChecks aria-hidden className="size-3.5" />
        Quiz
        {closed && <span className="font-normal normal-case tracking-normal">· closed</span>}
      </p>
      <p className="mb-3 font-medium">{attachment.question}</p>
      <div className="space-y-1.5">
        {attachment.options.map((option, index) => {
          const isAnswer = answered ? index === answer.correct : index === revealed;
          const isPicked = answered ? index === answer.option : index === pending;
          return (
            <button
              key={index}
              type="button"
              disabled={!quiz || answered || closed || pending !== null}
              aria-pressed={isPicked}
              onClick={() => void pick(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                !answered && !isAnswer && "border-border enabled:hover:bg-surface-2",
                !answered && isAnswer && "border-online bg-online/10 font-medium",
                !answered && isPicked && "border-accent bg-accent/10",
                answered && isAnswer && "border-online bg-online/10 font-medium",
                answered && isPicked && !isAnswer && "border-danger bg-danger/10",
                answered && !isAnswer && !isPicked && "border-border opacity-60",
              )}
            >
              <span className="flex-1">{option}</span>
              {isAnswer && <Check aria-label="Correct answer" className="size-4 text-online" />}
              {answered && isPicked && !isAnswer && <X aria-label="Your answer" className="size-4 text-danger" />}
            </button>
          );
        })}
      </div>
      <p
        role="status"
        className={cn("mt-2 text-xs", error ? "text-danger" : !answered ? "text-muted" : correct ? "text-online" : "text-danger")}
      >
        {error ?? (pending !== null ? "Checking…" : status())}
      </p>
    </fieldset>
  );

  function status() {
    if (answered) return correct ? "Correct!" : `Not quite. The answer is “${attachment.options[answer.correct]}”.`;
    if (closed) {
      return revealed >= 0 ? `This quiz has closed. The answer was “${attachment.options[revealed]}”.` : "This quiz has closed.";
    }
    const closes = attachment.closesAt ? ` Closes ${formatDateTime(attachment.closesAt)}.` : "";
    return `Pick an answer. You get one try.${closes}`;
  }
}
