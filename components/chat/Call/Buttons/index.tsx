"use client";

import { Phone, Video } from "lucide-react";
import { useCallContext, useChatContext } from "@/components/chat/Core/ChatContext";

/** Header buttons to call (or join the call) in this channel; hidden while you're in it. */
export function CallButtons({ subgroupId }: { subgroupId: string }) {
  const call = useCallContext();
  const { state } = useChatContext();
  if (call.current?.subgroupId === subgroupId) return null;
  const ongoing = Object.values(call.calls).find((c) => c.subgroupId === subgroupId);
  const disabled = state.status !== "ready" || call.busy;
  const go = (video: boolean) => void (ongoing ? call.join(ongoing.id, video) : call.start(subgroupId, video));
  const button =
    "inline-flex rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => go(false)}
        aria-label={ongoing ? "Join the call" : "Start a voice call"}
        title={ongoing ? "Join the call" : "Voice call"}
        className={button}
      >
        <Phone className="size-5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => go(true)}
        aria-label={ongoing ? "Join the call with video" : "Start a video call"}
        title={ongoing ? "Join with video" : "Video call"}
        className={button}
      >
        <Video className="size-5" />
      </button>
    </>
  );
}

export default CallButtons;
