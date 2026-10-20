import type { Mention as MentionType, User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type MentionProps = {
  attachment: MentionType;
  user?: User;
  isSelf: boolean;
  /** Rendered in place of "@Name" inside the text rather than before it. */
  inline?: boolean;
};

export default function Mention({ attachment, user, isSelf, inline = false }: MentionProps) {
  return (
    <span
      className={cn(
        "inline rounded px-0.5 font-medium",
        !inline && "mr-1",
        isSelf ? "bg-accent/25 text-foreground" : "bg-accent/10 text-accent-bright",
      )}
      title={user ? undefined : attachment.userId}
    >
      @{user?.name ?? "unknown"}
    </span>
  );
}
