"use client";

import type { ReactNode } from "react";
import { AtSign, MessageCircle, Phone, ShieldBan, ShieldOff, Video } from "lucide-react";
import Menu, { type MenuItem, type MenuTriggerProps } from "@/components/Menu";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useCallContext, useChatContext } from "@/components/chat/Core/ChatContext";
import { CustomStatus, STATUS_LABELS } from "@/components/chat/Status";

/** Guests have no account to message: direct messages are between signed-in people. */
const isGuest = (id: string) => id.startsWith("guest-");

type UserMenuProps = {
  userId: string;
  /** Put "@name" in the composer (absent where there's none, e.g. a pin list). */
  onMention?: (name: string) => void;
  /** More actions, after a separator (e.g. "View profile" in the members panel). */
  extraItems?: MenuItem[];
  /** Renders what opens it (an avatar, a name); `props` is undefined when there's no menu to open. */
  children: (props: MenuTriggerProps | undefined) => ReactNode;
};

/**
 * Someone's menu, opened from their avatar or name: message them, call them,
 * mention them, plus whatever `extraItems` the place offers, then block or
 * unblock them. For yourself it's only the extra items; with nothing in it,
 * nothing opens.
 */
export function UserMenu({ userId, onMention, extraItems = [], children }: UserMenuProps) {
  const { state, openDm, select, setBlocked } = useChatContext();
  const call = useCallContext();
  const user = state.users[userId];
  if (!user) return <>{children(undefined)}</>;
  // Yourself: only what the caller offers (nothing to message or mention).
  const self = userId === state.selfId;

  const canDm = !self && !isGuest(state.selfId) && !isGuest(userId) && user.role !== "bot" && state.status === "ready";
  /** Open (or start) your direct message with them, then maybe call in it. */
  async function message(callWith?: "voice" | "video") {
    const result = await openDm([userId]);
    if (!result.ok) return;
    select(result.subgroupId);
    if (callWith) await call.start(result.subgroupId, callWith === "video");
  }

  const items: MenuItem[] = [
    ...(canDm
      ? [
          { label: "Message", icon: <MessageCircle className="size-4" />, onSelect: () => void message() },
          { label: "Voice call", icon: <Phone className="size-4" />, disabled: call.busy, onSelect: () => void message("voice") },
          { label: "Video call", icon: <Video className="size-4" />, disabled: call.busy, onSelect: () => void message("video") },
        ]
      : []),
    ...(onMention && !self
      ? [{ label: "Mention", icon: <AtSign className="size-4" />, onSelect: () => onMention(user.name) }]
      : []),
  ];
  // Blocking is last and asks for a second click; bots post announcements, so they can't be blocked.
  if (!self && user.role !== "bot" && state.status === "ready") {
    const blocked = state.blocked.includes(userId);
    items.push(
      ...(items.length > 0 ? [{ kind: "separator" as const }] : []),
      blocked
        ? { label: "Unblock", icon: <ShieldOff className="size-4" />, onSelect: () => void setBlocked(userId, false) }
        : {
            label: "Block",
            icon: <ShieldBan className="size-4" />,
            danger: true,
            confirm: `Click again to block ${user.name}`,
            onSelect: () => void setBlocked(userId, true),
          },
    );
  }
  if (extraItems.length > 0) items.push(...(items.length > 0 ? [{ kind: "separator" as const }] : []), ...extraItems);
  if (items.length === 0) return <>{children(undefined)}</>;

  return (
    <Menu
      label={user.name}
      className="w-64"
      items={items}
      header={
        <span className="flex items-center gap-2.5">
          <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="lg" status={user.status} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{user.name}</span>
            {user.statusEmoji || user.statusText ? (
              <CustomStatus user={user} className="text-xs text-muted" />
            ) : (
              <span className="block text-xs text-muted">{STATUS_LABELS[user.status]}</span>
            )}
            {user.bio && <span className="mt-1 line-clamp-3 block text-xs text-muted">{user.bio}</span>}
          </span>
        </span>
      }
      trigger={children}
    />
  );
}

export default UserMenu;
