import { BookOpen, Hash, Megaphone, MessagesSquare, Volume2 } from "lucide-react";
import type { GroupType } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const icons = { text: Hash, announcement: Megaphone, wiki: BookOpen, voice: Volume2, forum: MessagesSquare };

export const channelTypeLabel: Record<GroupType, string> = {
  text: "Text channel",
  announcement: "Announcement channel",
  wiki: "Wiki channel",
  voice: "Voice channel",
  forum: "Forum channel",
};

/** Decorative icon for a channel's type; the name is always shown beside it. */
export default function ChannelIcon({ type, className }: { type?: GroupType; className?: string }) {
  const Icon = icons[type ?? "text"] ?? Hash;
  return <Icon aria-hidden className={cn("shrink-0", className)} />;
}
