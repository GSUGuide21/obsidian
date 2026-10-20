"use client";

import { useState } from "react";
import { ChartBar, Check } from "lucide-react";
import type { PollAttachment, User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { card } from "../styles";

export type PollContext = {
  /** Member ids per option (shared, live). */
  votes?: string[][];
  selfId: string;
  users: Record<string, User>;
  /** Resolves to an error message, or undefined on success. `null` withdraws. */
  onVote: (option: number | null) => Promise<string | undefined>;
};

export default function Poll({ attachment, poll }: { attachment: PollAttachment; poll?: PollContext }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const votes = attachment.options.map((_, i) => poll?.votes?.[i] ?? []);
  const total = votes.reduce((sum, v) => sum + v.length, 0);
  const mine = poll ? votes.findIndex((v) => v.includes(poll.selfId)) : -1;

  async function choose(index: number) {
    if (!poll || pending) return;
    setPending(true);
    setError(undefined);
    // Clicking your current choice withdraws the vote.
    const failure = await poll.onVote(index === mine ? null : index);
    setPending(false);
    if (failure) setError(failure);
  }

  return (
    <fieldset className={card} aria-busy={pending}>
      <legend className="sr-only">Poll: {attachment.question}</legend>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        <ChartBar aria-hidden className="size-3.5" />
        Poll
      </p>
      <p className="mb-3 font-medium">{attachment.question}</p>
      <div className="space-y-1.5">
        {attachment.options.map((option, index) => {
          const selected = mine === index;
          const count = votes[index].length;
          const share = total ? Math.round((count / total) * 100) : 0;
          const voters = votes[index].map((id) => (id === poll?.selfId ? "You" : (poll?.users[id]?.name ?? "Someone")));
          return (
            <button
              key={index}
              type="button"
              disabled={!poll || pending}
              aria-pressed={selected}
              aria-label={`${option}: ${count} ${count === 1 ? "vote" : "votes"}${selected ? ", your vote" : ""}`}
              title={voters.length ? voters.join(", ") : undefined}
              onClick={() => void choose(index)}
              className={cn(
                "relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default",
                selected ? "border-accent font-medium" : "border-border hover:bg-surface-2",
              )}
            >
              {/* Result bar behind the label. */}
              <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 transition-[width] duration-300", selected ? "bg-accent/15" : "bg-surface-2")}
                style={{ width: `${share}%` }}
              />
              <span
                aria-hidden
                className={cn(
                  "relative flex size-4 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-accent bg-accent text-accent-foreground" : "border-muted",
                )}
              >
                {selected && <Check className="size-3" />}
              </span>
              <span className="relative flex-1">{option}</span>
              {total > 0 && (
                <span aria-hidden className="relative text-xs text-muted tabular-nums">
                  {share}% · {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className={cn("mt-2 text-xs", error ? "text-danger" : "text-muted")} aria-live="polite">
        {error ??
          `${total} ${total === 1 ? "vote" : "votes"}${
            mine >= 0 ? ` · You voted for “${attachment.options[mine]}” (click it again to remove)` : ""
          }`}
      </p>
    </fieldset>
  );
}
