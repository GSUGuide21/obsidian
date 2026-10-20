import { summarize } from "@/lib/chat/format";
import type { Message, User } from "@/lib/chat/types";

type PreviewProps = {
  message?: Message;
  author?: User;
  selfId: string;
};

export default function Preview({ message, author, selfId }: PreviewProps) {
  // Spans, not paragraphs: previews sit inside sidebar buttons.
  if (!message) return <span className="block truncate text-xs text-muted">No messages yet</span>;

  const name = message.authorId === selfId ? "You" : (author?.name ?? "Someone");
  return (
    <span className="block truncate text-xs text-muted">
      {/* "Ana joined the group" reads as a sentence; other messages are "Ana: text". */}
      <span className="text-foreground/75">{message.system ? name : `${name}:`}</span> {summarize(message)}
    </span>
  );
}
