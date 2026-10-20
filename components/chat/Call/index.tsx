"use client";

import { useState } from "react";
import { Maximize2, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, Video, VideoOff, X } from "lucide-react";
import { useCallContext, useChatContext } from "@/components/chat/Core/ChatContext";
import { dmName, isDm } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { CallBar } from "./Bar";
import { CallButtons } from "./Buttons";
import { IncomingCall } from "./Incoming";
import { CallAudio, Tile } from "./Tile";
import { formatDuration, useNow } from "./useNow";

export { CallBar, CallButtons, IncomingCall };

/** Columns for `count` tiles, so they stay as large as they can. */
function columns(count: number) {
  return count <= 1 ? "grid-cols-1" : count <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3";
}

/**
 * The call this tab is in: everyone's tiles and the controls. It shrinks to
 * a corner so you can keep chatting; sound plays either way. Outside a call
 * it only shows call errors (e.g. "No answer").
 */
export function CallWindow() {
  const call = useCallContext();
  const { state } = useChatContext();
  const [small, setSmall] = useState(false);
  const current = call.current;
  const now = useNow(Boolean(current));

  if (!current) {
    return call.error ? (
      <p
        role="alert"
        className="fixed bottom-4 left-1/2 z-60 flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm shadow-2xl"
      >
        <span className="min-w-0 flex-1">{call.error}</span>
        <button type="button" onClick={call.dismissError} aria-label="Dismiss" className="rounded p-0.5 text-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </p>
    ) : null;
  }

  const group = state.groups.find((g) => g.id === current.groupId);
  const channel = group?.subgroups.find((s) => s.id === current.subgroupId);
  const title = group && isDm(group) ? dmName(group, state.users, state.selfId) : `#${channel?.name ?? "call"}`;
  const others = current.participants.filter((p) => p.socketId !== call.selfSocketId);
  const waiting =
    others.length > 0
      ? null
      : current.ringing.length > 0
        ? `Calling ${current.ringing.map((id) => state.users[id]?.name ?? "someone").join(", ")}…`
        : "Waiting for others to join…";

  const self = (
    <Tile
      key="self"
      self
      stream={call.preview}
      user={state.users[state.selfId]}
      audio={call.media.audio}
      video={call.media.video}
      screen={call.media.screen}
      className={small ? "aspect-video" : "aspect-video sm:aspect-auto"}
    />
  );
  const tiles = others.map((p) => (
    <Tile
      key={p.socketId}
      stream={call.remote[p.socketId]}
      user={state.users[p.userId]}
      audio={p.audio}
      video={p.video}
      screen={p.screen}
      className={small ? "aspect-video" : "aspect-video sm:aspect-auto"}
    />
  ));

  const control = (on: boolean) =>
    cn(
      "inline-flex size-11 items-center justify-center rounded-full transition-colors pointer-coarse:size-12",
      on ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-neutral-900 hover:bg-white/85",
    );
  const controls = (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={call.toggleMic}
        aria-pressed={!call.media.audio}
        aria-label={call.media.audio ? "Mute" : "Unmute"}
        title={call.media.audio ? "Mute" : "Unmute"}
        className={control(call.media.audio)}
      >
        {call.media.audio ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </button>
      <button
        type="button"
        onClick={() => void call.toggleCamera()}
        aria-pressed={call.media.video}
        aria-label={call.media.video ? "Turn camera off" : "Turn camera on"}
        title={call.media.video ? "Camera off" : "Camera on"}
        className={control(call.media.video)}
      >
        {call.media.video ? <Video className="size-5" /> : <VideoOff className="size-5" />}
      </button>
      {call.canShareScreen && !small && (
        <button
          type="button"
          onClick={() => void call.toggleScreen()}
          aria-pressed={call.media.screen}
          aria-label={call.media.screen ? "Stop sharing your screen" : "Share your screen"}
          title={call.media.screen ? "Stop sharing" : "Share screen"}
          className={cn(control(true), call.media.screen && "bg-accent hover:bg-accent/85")}
        >
          <MonitorUp className="size-5" />
        </button>
      )}
      <button
        type="button"
        onClick={call.leave}
        aria-label="Leave the call"
        title="Leave"
        className="inline-flex h-11 items-center justify-center rounded-full bg-danger-strong px-5 text-white hover:opacity-90 pointer-coarse:h-12"
      >
        <PhoneOff className="size-5" />
      </button>
    </div>
  );

  return (
    <section
      role="region"
      aria-label={`Call: ${title}`}
      className={cn(
        "fixed z-50 flex flex-col gap-3 bg-neutral-950/95 p-3 text-white shadow-2xl backdrop-blur-xl",
        small
          ? "right-4 bottom-4 w-[min(20rem,calc(100vw-2rem))] rounded-2xl ring-1 ring-white/10"
          : "inset-0 sm:inset-4 sm:rounded-2xl sm:ring-1 sm:ring-white/10",
      )}
    >
      {/* Everyone's sound, in either size. */}
      {others.map((p) =>
        call.remote[p.socketId] ? <CallAudio key={p.socketId} stream={call.remote[p.socketId]} /> : null,
      )}

      <header className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-white/60">
            {waiting ?? `${current.participants.length} in call · ${formatDuration(now - current.startedAt)}`}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setSmall((was) => !was)}
          aria-label={small ? "Expand the call" : "Shrink the call"}
          title={small ? "Expand" : "Shrink"}
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          {small ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
        </button>
      </header>

      {small ? (
        // The first other person (or you, alone), with you in the corner.
        <div className="relative">
          {tiles[0] ?? self}
          {tiles[0] && <div className="absolute right-2 bottom-2 w-24">{self}</div>}
        </div>
      ) : (
        <div className={cn("grid min-h-0 flex-1 auto-rows-fr gap-3", columns(tiles.length + 1))}>
          {tiles}
          {self}
        </div>
      )}

      {call.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">{call.error}</span>
          <button type="button" onClick={call.dismissError} aria-label="Dismiss" className="text-white/70 hover:text-white">
            <X className="size-3.5" />
          </button>
        </p>
      )}
      {controls}
    </section>
  );
}

export default CallWindow;
