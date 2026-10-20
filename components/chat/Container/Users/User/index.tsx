import { VolumeOff } from "lucide-react";
import type { MenuItem } from "@/components/Menu";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { mentionInComposer } from "@/components/chat/Container/Chat";
import { CustomStatus, STATUS_LABELS } from "@/components/chat/Status";
import UserMenu from "@/components/chat/UserMenu";
import { isOnline, type User as UserType } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type UserProps = {
  user: UserType;
  isSelf: boolean;
  muted?: boolean;
  /** Their role, as a tag (where the list isn't already grouped by role). */
  role?: string;
  /** The panel's actions for them (their profile, moderation; for you, your profiles and leaving). */
  items: MenuItem[];
  /** Open their profile directly (when there's no menu, e.g. they've gone). */
  onOpen: () => void;
};

/**
 * A row in the members panel. Clicking it opens a menu: message, call and
 * mention them (from UserMenu), then the panel's `items`.
 */
export default function User({ user, isSelf, muted, role, items, onOpen }: UserProps) {
  const online = isOnline(user);
  const custom = Boolean(user.statusEmoji || user.statusText);
  // Under the name: their custom status, else when they're away or busy.
  const presence = user.status === "away" || user.status === "dnd" ? STATUS_LABELS[user.status] : undefined;
  const row = (
    <>
      <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="sm" status={user.status} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("truncate text-sm", online ? "text-foreground" : "text-muted")}>{user.name}</span>
          {isSelf && <span className="shrink-0 text-[11px] text-muted">you</span>}
        </span>
        {custom ? (
          <CustomStatus user={user} className="text-[11px] text-muted" />
        ) : (
          presence && <span className="block truncate text-[11px] text-muted">{presence}</span>
        )}
      </span>
      {user.role === "bot" && (
        <span className="shrink-0 rounded bg-accent/15 px-1 text-[10px] font-semibold tracking-wide text-accent-bright uppercase">
          Bot
        </span>
      )}
      {role && <span className="shrink-0 text-[11px] text-muted">{role}</span>}
      {muted && <VolumeOff aria-label="Muted" className="size-3.5 shrink-0 text-warning" />}
    </>
  );
  // Offline people stay readable (their names go muted), with their photo dimmed.
  const className = cn(
    "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 aria-expanded:bg-surface-2",
    !online && "[&>span:first-child]:opacity-50",
  );

  return (
    <li>
      <UserMenu userId={user.id} onMention={mentionInComposer} extraItems={items}>
        {(props) =>
          props ? (
            <button type="button" {...props} aria-label={`${user.name}: options`} className={className}>
              {row}
            </button>
          ) : (
            <button type="button" onClick={onOpen} title={`View ${user.name}'s profile`} className={className}>
              {row}
            </button>
          )
        }
      </UserMenu>
    </li>
  );
}
