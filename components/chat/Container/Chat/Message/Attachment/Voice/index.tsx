"use client";

import { useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/chat/format";
import type { VoiceAttachment } from "@/lib/chat/types";
import { safeUrl } from "@/lib/chat/url";

/** Compact voice-note player: play/pause, scrubber and elapsed time. */
export default function Voice({ attachment }: { attachment: VoiceAttachment }) {
  const src = safeUrl(attachment.src);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  if (!src) return null;

  const label = attachment.alt || attachment.caption || "Voice message";

  return (
    <div className="flex w-full max-w-xs items-center gap-3 rounded-full border border-border bg-surface py-1.5 pr-4 pl-1.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          // Browser-recorded WebM has no duration header; seeking to the end
          // makes the browser compute it, then durationchange reports it.
          if (audio.duration === Infinity) audio.currentTime = 1e101;
          else setDuration(audio.duration);
        }}
        onDurationChange={(event) => {
          const audio = event.currentTarget;
          if (!Number.isFinite(audio.duration)) return;
          setDuration(audio.duration);
          if (audio.paused && audio.currentTime > 0 && position === 0) audio.currentTime = 0;
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPosition(0)}
      />
      <button
        type="button"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) void audio.play();
          else audio.pause();
        }}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground hover:opacity-90"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={position}
          aria-label={`Seek ${label}`}
          aria-valuetext={`${formatDuration(position)} of ${formatDuration(duration)}`}
          onChange={(event) => {
            const audio = audioRef.current;
            const next = Number(event.target.value);
            if (audio) audio.currentTime = next;
            setPosition(next);
          }}
          className="h-1 w-full cursor-pointer accent-accent"
        />
        {attachment.caption && (
          <p className="truncate text-[11px] text-muted">{attachment.caption}</p>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted tabular-nums">
        <Mic aria-hidden className="size-3" />
        {formatDuration(playing || position ? position : duration)}
      </span>
    </div>
  );
}
