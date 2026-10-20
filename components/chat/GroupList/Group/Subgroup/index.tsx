"use client";

import { BellOff, MicOff, MonitorUp, Settings, Video, Volume2 } from "lucide-react";
import ChannelIcon, { channelTypeLabel } from "@/components/chat/ChannelIcon";
import { useCallContext, useChatContext } from "@/components/chat/Core/ChatContext";
import type { Call, Subgroup as SubgroupType, User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import Avatar from "../Avatar";
import UnreadBadge from "../UnreadBadge";

type SubgroupProps = {
  subgroup: SubgroupType;
  active: boolean;
  unread: number;
  /** Unread messages addressed to you: shown instead of the unread count. */
  mentions?: number;
  /** Notifications are off for it: unread messages don't stand out. */
  muted?: boolean;
  onSelect: () => void;
  /** Those who manage the group: open the channel's settings. */
  onSettings?: () => void;
  /** Those who manage the group: makes the row draggable. */
  dragProps?: object;
};

/**
 * A channel in the sidebar: one compact line (its icon, name and what's
 * unread). What was said shows on its group's row while that's collapsed,
 * and in the channel itself.
 */
export default function Subgroup({
  subgroup,
  active,
  unread,
  mentions = 0,
  muted = false,
  onSelect,
  onSettings,
  dragProps,
}: SubgroupProps) {
  const showMentions = mentions > 0 && !active;
  const showUnread = !muted && unread > 0 && !active;
  const type = subgroup.type ?? "text";
  const voice = type === "voice";
  const call = useCallContext();
  const { state } = useChatContext();
  // The call (or room) here right now.
  const ongoing = Object.values(call.calls).find((c) => c.subgroupId === subgroup.id);
  const inCall = ongoing?.participants.length ?? 0;
  // Voice channels list who's in them instead of a count.
  const showCount = inCall > 0 && !voice;
  // Picking a voice channel joins its call (audio only), as well as opening its chat.
  const joinVoice = () => {
    if (call.busy || state.status !== "ready" || call.current?.subgroupId === subgroup.id) return;
    void (ongoing ? call.join(ongoing.id, false) : call.start(subgroup.id, false));
  };
  return (
    <div className="group/channel relative">
      <button
        type="button"
        onClick={() => {
          onSelect();
          if (voice) joinVoice();
        }}
        aria-current={active ? "page" : undefined}
        title={subgroup.topic ? `${subgroup.name}: ${subgroup.topic}` : undefined}
        {...dragProps}
        className={cn(
          "relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors pointer-coarse:h-10",
          // Room for the settings button, always shown on the open channel on touch screens.
          onSettings && active && "pointer-coarse:pr-9",
          active
            ? "bg-accent/15 font-medium text-foreground"
            : showUnread || showMentions
              ? "font-semibold text-foreground hover:bg-surface-2"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          muted && !active && !showMentions && "opacity-60",
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-1.5 -left-2.25 w-0.5 rounded-full bg-accent" />}
        <ChannelIcon type={type} className={cn("size-4", active ? "text-accent-bright" : "opacity-70")} />
        <span className="min-w-0 flex-1 truncate">{subgroup.name}</span>
        {type !== "text" && <span className="sr-only">({channelTypeLabel[type]})</span>}
        {showCount && (
          <span
            aria-label={`${inCall} in a call`}
            className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-online tabular-nums"
          >
            <Volume2 aria-hidden className="size-3.5" />
            {inCall}
          </span>
        )}
        {muted && <BellOff aria-label="Notifications off" className="size-3 shrink-0 opacity-70" />}
        {(showMentions || showUnread) && (
          // The settings button takes its place while it shows (hover, or focus).
          <span className={cn("flex", onSettings && "group-focus-within/channel:opacity-0 group-hover/channel:opacity-0")}>
            {showMentions ? <UnreadBadge count={mentions} mention /> : <UnreadBadge count={unread} />}
          </span>
        )}
      </button>
      {onSettings && (
        // A sibling of the row button (buttons can't nest), shown over its right end.
        <button
          type="button"
          onClick={onSettings}
          aria-label={`#${subgroup.name} settings`}
          title="Channel settings"
          className={cn(
            "absolute inset-y-1 right-1 flex items-center rounded bg-surface-2 px-1 text-muted opacity-0 transition-opacity group-hover/channel:opacity-100 hover:text-foreground focus-visible:opacity-100",
            active && "pointer-coarse:bg-transparent pointer-coarse:px-2 pointer-coarse:opacity-100",
          )}
        >
          <Settings className="size-3.5 pointer-coarse:size-4" />
        </button>
      )}
      {voice && ongoing && inCall > 0 && (
        <VoiceParticipants call={ongoing} users={state.users} name={subgroup.name} />
      )}
    </div>
  );
}

/** Who's connected to a voice channel, with what they're muting or sharing. */
function VoiceParticipants({ call, users, name }: { call: Call; users: Record<string, User>; name: string }) {
  return (
    <ul aria-label={`In #${name}`} className="mb-1 ml-6 space-y-px">
      {call.participants.map((p) => {
        const user = users[p.userId];
        const label = user?.name ?? "Someone";
        return (
          <li key={p.socketId} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted">
            <Avatar name={label} color={user?.color ?? "#6b7280"} src={user?.avatarUrl} size="xs" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {p.screen && <MonitorUp aria-label="Sharing their screen" className="size-3 shrink-0 text-accent-bright" />}
            {p.video && !p.screen && <Video aria-label="Camera on" className="size-3 shrink-0" />}
            {!p.audio && <MicOff aria-label="Muted" className="size-3 shrink-0 text-danger" />}
          </li>
        );
      })}
    </ul>
  );
}
