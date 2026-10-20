"use client";

import { useEffect, useRef } from "react";
import { MicOff, MonitorUp } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useSettings } from "@/lib/chat/settings";
import type { User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type TileProps = {
  stream: MediaStream | null | undefined;
  user: User | undefined;
  audio: boolean;
  video: boolean;
  screen: boolean;
  /** Your own tile: mirrored camera, and labelled "you". */
  self?: boolean;
  className?: string;
};

/**
 * One person in a call: their video (or screen), else their avatar, with
 * their name and a muted mic. It's silent: sound plays from <CallAudio>, so
 * it keeps going while the call window is small.
 */
export function Tile({ stream, user, audio, video, screen, self = false, className }: TileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream ?? null;
    // Tiles remount when the window changes size: start the new element right away.
    if (stream) void video.play().catch(() => {});
  }, [stream]);
  const showVideo = (video || screen) && Boolean(stream?.getVideoTracks().length);
  const name = user?.name ?? "Someone";

  return (
    <div
      className={cn(
        "relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10",
        className,
      )}
    >
      <video
        ref={ref}
        muted
        autoPlay
        playsInline
        className={cn(
          "size-full",
          screen ? "object-contain" : "object-cover",
          self && !screen && "-scale-x-100",
          !showVideo && "hidden",
        )}
      />
      {!showVideo && (
        <Avatar name={name} color={user?.color ?? "#64748b"} src={user?.avatarUrl} className="size-16 text-xl" />
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur">
        {!audio && <MicOff aria-label="Muted" className="size-3.5 shrink-0 text-red-400" />}
        {screen && <MonitorUp aria-label="Sharing their screen" className="size-3.5 shrink-0" />}
        <span className="truncate">{self ? `${name} (you)` : name}</span>
      </span>
    </div>
  );
}

/** Plays one person's sound (hidden; mounted for as long as they're in the call). */
export function CallAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  const { speakerId } = useSettings();
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().catch(() => {});
  }, [stream]);
  // The speaker chosen in settings (where the browser lets pages pick one).
  useEffect(() => {
    const audio = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    void audio?.setSinkId?.(speakerId ?? "").catch(() => {});
  }, [speakerId]);
  return <audio ref={ref} autoPlay />;
}
