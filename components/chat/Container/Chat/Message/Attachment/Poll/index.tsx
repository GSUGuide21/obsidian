"use client";

import { useState } from "react";
import { ChartBar, Check } from "lucide-react";
import { formatDateTime } from "@/lib/chat/format";
import type { PollAttachment, User } from "@/lib/chat/types";
import { useUntil } from "@/lib/hooks/useUntil";
import { cn } from "@/lib/utils";
import { card } from "../styles";

export type PollContext = {
  /** Member ids per option (shared, live). */
  votes?: string[][];
  selfId: string;
  users: Record<string, User>;
  /**
   * Resolves to an error message, or undefined on success. `null` withdraws;
   * `chosen: false` takes back one choice in a multiple-choice poll.
   */
  onVote: (option: number | null, chosen?: boolean) => Promise<string | undefined>;
};

export default function Poll({ attachment, poll }: { attachment: PollAttachment; poll?: PollContext }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const votes = attachment.options.map((_, i) => poll?.votes?.[i] ?? []);
  const multiple = attachment.multiple === true;
  // Shares are of the people who voted (in a multiple-choice poll they add up to more than 100%).
  const voters = new Set(votes.flat()).size;
  const mine = poll ? votes.flatMap((v, i) => (v.includes(poll.selfId) ? [i] : [])) : [];
  const max = multiple ? attachment.maxChoices : undefined;
  // At the limit, only your own choices can be clicked (to take one back).
  const full = max !== undefined && mine.length >= max;
  const open = useUntil(attachment.closesAt);
  const closed = attachment.closesAt !== undefined && !open;

  async function choose(index: number) {
    if (!poll || pending || closed) return;
    setPending(true);
    setError(undefined);
    // Clicking a choice of yours takes it back.
    const chosen = mine.includes(index);
    const failure = await (multiple ? poll.onVote(index, !chosen) : poll.onVote(chosen ? null : index));
    setPending(false);
    if (failure) setError(failure);
  }

  return (
    <fieldset className={card} aria-busy={pending}>
      <legend className="sr-only">Poll: {attachment.question}</legend>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        <ChartBar aria-hidden className="size-3.5" />
        Poll
        {multiple && (
          <span className="font-normal normal-case tracking-normal">· {max ? `pick up to ${max}` : "pick any"}</span>
        )}
        {closed && <span className="font-normal normal-case tracking-normal">· closed</span>}
      </p>
      <p className="mb-3 font-medium">{attachment.question}</p>
      <div className="space-y-1.5">
        {attachment.options.map((option, index) => {
          const selected = mine.includes(index);
          const count = votes[index].length;
          const share = voters ? Math.round((count / voters) * 100) : 0;
          const names = votes[index].map((id) => (id === poll?.selfId ? "You" : (poll?.users[id]?.name ?? "Someone")));
          return (
            <button
              key={index}
              type="button"
              disabled={!poll || pending || closed || (full && !selected)}
              aria-pressed={selected}
              aria-label={`${option}: ${count} ${count === 1 ? "vote" : "votes"}${selected ? ", your vote" : ""}`}
              title={names.length ? names.join(", ") : undefined}
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
                  "relative flex size-4 shrink-0 items-center justify-center border",
                  multiple ? "rounded" : "rounded-full",
                  selected ? "border-accent bg-accent text-accent-foreground" : "border-muted",
                )}
              >
                {selected && <Check className="size-3" />}
              </span>
              <span className="relative flex-1">{option}</span>
              {voters > 0 && (
                <span aria-hidden className="relative text-xs text-muted tabular-nums">
                  {share}% · {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className={cn("mt-2 text-xs", error ? "text-danger" : "text-muted")} aria-live="polite">
        {error ?? summary(voters, multiple, mine.map((i) => attachment.options[i]), closed)}
        {!error && attachment.closesAt !== undefined && !closed && ` · Closes ${formatDateTime(attachment.closesAt)}`}
      </p>
    </fieldset>
  );
}

/** Under the options: how many voted, and what you picked. */
function summary(voters: number, multiple: boolean, mine: string[], closed: boolean) {
  const count = multiple ? `${voters} ${voters === 1 ? "person" : "people"} voted` : `${voters} ${voters === 1 ? "vote" : "votes"}`;
  if (mine.length === 0) return closed ? `Voting closed · ${count}` : count;
  const picked = mine.map((option) => `“${option}”`).join(", ");
  if (closed) return `Voting closed · ${count} · You voted for ${picked}`;
  return `${count} · You voted for ${picked} (click ${mine.length === 1 ? "it" : "one"} again to remove)`;
}
