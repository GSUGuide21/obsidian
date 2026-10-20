"use client";

import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useCallContext, useChatContext } from "@/components/chat/Core/ChatContext";
import { useSettings } from "@/lib/chat/settings";
import { dmName } from "@/lib/chat/types";

/** A soft two-note ring every few seconds while `on`, via Web Audio (no sound file). */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on || typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    const ring = () => {
      // Browsers hold sound back until the page has been interacted with; then this starts it.
      void context.resume().catch(() => {});
      const start = context.currentTime;
      [659.25, 830.61].forEach((frequency, i) => {
        const at = start + i * 0.22;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.5);
      });
    };
    ring();
    const timer = setInterval(ring, 2500);
    return () => {
      clearInterval(timer);
      void context.close();
    };
  }, [on]);
}

/** Calls ringing for you (not one you're already in): who's calling, and Decline / Answer. */
export function IncomingCall() {
  const call = useCallContext();
  const { state } = useChatContext();
  const ringing = Object.values(call.calls).find(
    (c) => c.ringing.includes(state.selfId) && c.id !== call.current?.id && c.participants.length > 0,
  );
  const { ringtone } = useSettings();
  // Do not disturb (or the ringtone off in settings): the card shows, silently.
  useRingtone(Boolean(ringing) && ringtone && state.presence !== "dnd");
  if (!ringing) return null;

  const caller = state.users[ringing.startedBy];
  const group = state.groups.find((g) => g.id === ringing.groupId);
  const others = (group?.members?.length ?? 0) > 2 && group ? dmName(group, state.users, state.selfId) : null;
  const disabled = state.status !== "ready" || call.busy;

  return (
    <section
      role="alertdialog"
      aria-label={`Incoming ${ringing.video ? "video" : "voice"} call from ${caller?.name ?? "someone"}`}
      className="fixed top-4 left-1/2 z-60 flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-2xl"
    >
      <span className="relative">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-online/40" />
        <Avatar name={caller?.name ?? "?"} color={caller?.color ?? "#64748b"} src={caller?.avatarUrl} size="lg" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{caller?.name ?? "Someone"}</span>
        <span className="block truncate text-xs text-muted">
          {ringing.video ? "Video call" : "Voice call"}
          {others && ` · ${others}`}
        </span>
      </span>
      <button
        type="button"
        onClick={() => call.decline(ringing.id)}
        aria-label="Decline"
        title="Decline"
        className="inline-flex size-10 items-center justify-center rounded-full bg-danger-strong text-white hover:opacity-90"
      >
        <PhoneOff className="size-5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void call.join(ringing.id, false)}
        aria-label="Answer with voice"
        title="Answer"
        className="inline-flex size-10 items-center justify-center rounded-full bg-online text-white hover:opacity-90 disabled:opacity-50"
      >
        <Phone className="size-5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void call.join(ringing.id, true)}
        aria-label="Answer with video"
        title="Answer with video"
        className="inline-flex size-10 items-center justify-center rounded-full bg-online text-white hover:opacity-90 disabled:opacity-50"
      >
        <Video className="size-5" />
      </button>
    </section>
  );
}

export default IncomingCall;
