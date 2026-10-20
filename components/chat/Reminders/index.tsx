import { Bell, X } from "lucide-react";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { formatEventWhen } from "@/lib/chat/format";
import type { EventReminder } from "@/lib/chat/types";

type RemindersProps = {
  /** Open the event's channel (and dismiss the card). */
  onOpen: (reminder: EventReminder) => void;
};

/** Cards for due event reminders, stacked in the corner until dismissed. */
export default function Reminders({ onOpen }: RemindersProps) {
  const {
    state: { reminders },
    dismissReminder: onDismiss,
  } = useChatContext();
  if (reminders.length === 0) return null;
  return (
    <section
      aria-label="Reminders"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {reminders.map((reminder) => (
        <article
          key={reminder.messageId}
          className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-2xl"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
            <Bell aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{reminder.title}</p>
            <p className="text-xs text-muted">{formatEventWhen(reminder.startTime, undefined, reminder.allDay)}</p>
            <button
              type="button"
              onClick={() => onOpen(reminder)}
              className="mt-1.5 text-xs font-medium text-accent-bright hover:underline"
            >
              Go to event
            </button>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(reminder.messageId)}
            aria-label={`Dismiss the reminder for ${reminder.title}`}
            className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </article>
      ))}
    </section>
  );
}
