import { cn } from "@/lib/utils";

/** An unread count; `mention` for messages addressed to you (mentions, replies, DMs), which stand out. */
export default function UnreadBadge({ count, mention = false }: { count: number; mention?: boolean }) {
  return (
    <span
      className={cn(
        "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold",
        mention ? "bg-danger-strong text-white" : "bg-accent text-accent-foreground",
      )}
    >
      <span className="sr-only">{mention ? "Messages for you: " : "Unread messages: "}</span>
      {count > 99 ? "99+" : count}
    </span>
  );
}
