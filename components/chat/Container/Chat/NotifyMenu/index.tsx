"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import type { NotificationLevel } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const LEVELS: { level: NotificationLevel; label: string }[] = [
  { level: "all", label: "All messages" },
  { level: "mentions", label: "Mentions and replies" },
  { level: "none", label: "Nothing" },
];

const LABEL: Record<NotificationLevel, string> = { all: "All messages", mentions: "Mentions and replies", none: "Nothing" };

type NotifyMenuProps = {
  /** Direct messages have one setting; groups have one for the channel and one for the whole group. */
  dm: boolean;
  channelName: string;
  groupName: string;
  /** Your own settings; absent means "default". */
  channelLevel?: NotificationLevel;
  groupLevel?: NotificationLevel;
  /** What applies to this channel right now. */
  effective: NotificationLevel;
  /** Resolves to an error message. */
  onSetChannel: (level: NotificationLevel | null) => Promise<string | undefined>;
  onSetGroup: (level: NotificationLevel | null) => Promise<string | undefined>;
};

/** Header button with a popover for this channel's (and group's) notification settings. */
export default function NotifyMenu({
  dm,
  channelName,
  groupName,
  channelLevel,
  groupLevel,
  effective,
  onSetChannel,
  onSetGroup,
}: NotifyMenuProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function set(action: Promise<string | undefined>) {
    setError(undefined);
    setError(await action);
  }

  // A channel without its own setting follows its group's (or the default).
  const groupDefault: NotificationLevel = dm ? "all" : "mentions";
  const channelFallback = groupLevel ?? groupDefault;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Notifications: ${LABEL[effective]}`}
        title={`Notifications: ${LABEL[effective]}`}
        className={cn(
          "inline-flex rounded-md p-2 transition-colors hover:bg-surface-2",
          open ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
        )}
      >
        {effective === "none" ? <BellOff className="size-5" /> : <Bell className="size-5" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notification settings"
          className="absolute top-full right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-border bg-surface p-3 shadow-2xl"
        >
          <Section
            title={dm ? "This conversation" : `#${channelName}`}
            current={channelLevel}
            fallback={dm ? groupDefault : channelFallback}
            fallbackLabel={dm ? "Default" : groupLevel ? `Same as ${groupName}` : "Default"}
            onPick={(level) => void set(onSetChannel(level))}
          />
          {!dm && (
            <Section
              title={`All of ${groupName}`}
              current={groupLevel}
              fallback={groupDefault}
              fallbackLabel="Default"
              onPick={(level) => void set(onSetGroup(level))}
            />
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <div className="border-t border-border pt-2 text-xs text-muted">
            {permission === "default" ? (
              <button
                type="button"
                onClick={() => void Notification.requestPermission().then(setPermission)}
                className="font-medium text-accent-bright hover:underline"
              >
                Turn on desktop notifications
              </button>
            ) : permission === "denied" ? (
              "Desktop notifications are blocked in your browser's site settings."
            ) : permission === "granted" ? (
              "Desktop notifications are on while this tab is in the background."
            ) : (
              "This browser can't show desktop notifications."
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  current,
  fallback,
  fallbackLabel,
  onPick,
}: {
  title: string;
  current?: NotificationLevel;
  fallback: NotificationLevel;
  fallbackLabel: string;
  onPick: (level: NotificationLevel | null) => void;
}) {
  const options: { level: NotificationLevel | null; label: string; detail?: string }[] = [
    { level: null, label: fallbackLabel, detail: LABEL[fallback] },
    ...LEVELS,
  ];
  return (
    <fieldset>
      <legend className="mb-1 truncate px-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</legend>
      {options.map((option) => {
        const selected = (current ?? null) === option.level;
        return (
          <button
            key={option.label}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => onPick(option.level)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            <Check aria-hidden className={cn("size-3.5 shrink-0", selected ? "text-accent-bright" : "invisible")} />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.detail && <span className="shrink-0 text-xs text-muted">{option.detail}</span>}
          </button>
        );
      })}
    </fieldset>
  );
}
