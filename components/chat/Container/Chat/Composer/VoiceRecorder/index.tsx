"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { formatDuration } from "@/lib/chat/format";

const MAX_SECONDS = 5 * 60;

type VoiceRecorderProps = {
  onDone: (file: File) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

/** Records from the microphone as soon as it mounts. */
export default function VoiceRecorder({ onDone, onCancel, onError }: VoiceRecorderProps) {
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const done = useEffectEvent(onDone);
  const fail = useEffectEvent(onError);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const chunks: Blob[] = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = granted;
        const recorder = new MediaRecorder(granted);
        recorderRef.current = recorder;
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("stop", () => {
          stream?.getTracks().forEach((track) => track.stop());
          if (cancelled) return;
          // A bare container header (~100 bytes) means the mic delivered no audio.
          if (chunks.reduce((sum, chunk) => sum + chunk.size, 0) < 1024) {
            fail("Nothing was recorded. Check that your microphone is working.");
            return;
          }
          const type = recorder.mimeType || "audio/webm";
          const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
          done(new File(chunks, `voice-message.${ext}`, { type }));
        });
        recorder.start();
        setReady(true);
        const started = Date.now();
        timer = setInterval(() => {
          const seconds = (Date.now() - started) / 1000;
          setElapsed(seconds);
          if (seconds >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
        }, 250);
      })
      .catch(() => {
        if (!cancelled) fail("Microphone access was blocked. Allow it in your browser to record.");
      });

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="flex min-h-9 flex-1 items-center gap-3 px-2" role="status">
      <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-danger-strong" />
      <span className="flex-1 text-sm">
        {ready ? "Recording" : "Waiting for microphone…"}{" "}
        <span className="text-muted tabular-nums">{formatDuration(elapsed)}</span>
      </span>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Discard recording"
        className="rounded-md p-2 text-muted hover:bg-surface hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <button
        type="button"
        disabled={!ready}
        onClick={() => recorderRef.current?.stop()}
        aria-label="Finish recording"
        className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-40"
      >
        <Check className="size-4" />
      </button>
    </div>
  );
}
