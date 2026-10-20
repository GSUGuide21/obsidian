import { CornerUpLeft } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { authorName, summarize } from "@/lib/chat/format";
import type { Message, User } from "@/lib/chat/types";

type ReplyProps = {
  /** `undefined` while it's being fetched, `null` if it no longer exists. */
  original: Message | null | undefined;
  author?: User;
  /** Present when the original is rendered in the list and can be scrolled to. */
  onJump?: () => void;
};

const row = "mb-0.5 flex max-w-full items-center gap-1.5 text-xs text-muted";

/** Quote of the replied-to message, shown above the reply. */
export default function Reply({ original, author, onJump }: ReplyProps) {
  if (original === undefined) {
    return (
      <p className={row} aria-busy>
        <CornerUpLeft aria-hidden className="size-3.5 shrink-0" />
        <span className="h-3 w-40 animate-pulse rounded bg-surface-2" />
        <span className="sr-only">Loading the original message</span>
      </p>
    );
  }
  if (original === null) {
    return (
      <p className={`${row} italic`}>
        <CornerUpLeft aria-hidden className="size-3.5 shrink-0" />
        Original message was deleted
      </p>
    );
  }

  const name = authorName(author, original.authorId);
  const content = (
    <>
      <CornerUpLeft aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">Replying to</span>
      <Avatar name={name} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} size="xs" />
      <span className="shrink-0 font-medium text-foreground/80">{name}</span>
      <span className="truncate">{summarize(original)}</span>
    </>
  );

  return onJump ? (
    <button type="button" onClick={onJump} className={`${row} text-left hover:text-foreground`}>
      {content}
    </button>
  ) : (
    <p className={row} title="Older message, not loaded in this view">
      {content}
    </p>
  );
}
