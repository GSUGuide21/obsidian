"use client";

import { Phone, Video } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useCallContext, useChatContext } from "@/components/chat/Core/ChatContext";
import { formatDuration, useNow } from "../useNow";

/** Under a channel's header while a call you're not in is going on there: who's in it, and Join. */
export function CallBar({ subgroupId }: { subgroupId: string }) {
  const call = useCallContext();
  const { state } = useChatContext();
  const ongoing = Object.values(call.calls).find((c) => c.subgroupId === subgroupId);
  const now = useNow(Boolean(ongoing));
  if (!ongoing || call.current?.id === ongoing.id || ongoing.participants.length === 0) return null;
  const people = [...new Set(ongoing.participants.map((p) => p.userId))];
  const disabled = state.status !== "ready" || call.busy;

  return (
    <div role="status" className="flex items-center gap-3 border-b border-border bg-online/10 px-4 py-2 text-sm">
      <span className="flex -space-x-2">
        {people.slice(0, 4).map((id) => {
          const user = state.users[id];
          return (
            <Avatar
              key={id}
              size="sm"
              name={user?.name ?? "?"}
              color={user?.color ?? "#64748b"}
              src={user?.avatarUrl}
              className="ring-2 ring-surface"
            />
          );
        })}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">Call in progress</span>
        <span className="text-muted">
          {" "}
          · {people.length} {people.length === 1 ? "person" : "people"} · {formatDuration(now - ongoing.startedAt)}
        </span>
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void call.join(ongoing.id, false)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-online px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Phone aria-hidden className="size-3.5" />
        Join
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void call.join(ongoing.id, true)}
        aria-label="Join with video"
        title="Join with video"
        className="inline-flex size-8 items-center justify-center rounded-lg bg-surface-2 text-foreground hover:bg-surface disabled:opacity-50"
      >
        <Video aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export default CallBar;
