import { useState } from "react";
import { Bell, CalendarDays, Check, Globe, MapPin, Pencil, Users } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { authorName, formatDateTime, formatEventWhen } from "@/lib/chat/format";
import { eventEnd, type EventAttachment, type User } from "@/lib/chat/types";
import { safeUrl } from "@/lib/chat/url";
import { cn } from "@/lib/utils";
import { card } from "../styles";

const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });

/** What RSVPing needs: who you are, who everyone is, and how to answer. */
export type RsvpContext = {
  selfId: string;
  users: Record<string, User>;
  /** Resolves to an error message. */
  onRsvp: (going: boolean) => Promise<string | undefined>;
};

export default function Event({
  attachment,
  onManage,
  rsvp,
}: {
  attachment: EventAttachment;
  /** Its creator and moderators: open the editor. */
  onManage?: () => void;
  /** Absent where answering isn't possible (e.g. a message still sending). */
  rsvp?: RsvpContext;
}) {
  const { title, description, startTime, endTime, allDay, location, attendees, reminders, cancelled } = attachment;
  const locationUrl = safeUrl(attachment.locationUrl);

  return (
    <article className={cn(card, "flex gap-3", cancelled && "opacity-70")} aria-label={`Event: ${title}${cancelled ? " (cancelled)" : ""}`}>
      <div
        aria-hidden
        className={cn(
          "flex size-12 shrink-0 flex-col items-center justify-center rounded-lg",
          cancelled ? "bg-surface-2 text-muted" : "bg-accent/15 text-accent-bright",
        )}
      >
        <span className="text-[10px] leading-none font-semibold uppercase">
          {monthFormat.format(startTime)}
        </span>
        <span className="text-lg leading-tight font-bold">{new Date(startTime).getDate()}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <p className={cn("min-w-0 flex-1 font-semibold", cancelled && "line-through")}>{title}</p>
          {onManage && (
            <button
              type="button"
              onClick={onManage}
              aria-label={`Manage the event ${title}`}
              title="Manage event"
              className="-mt-0.5 -mr-1 shrink-0 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
        {(cancelled || attachment.visibility === "public") && (
          <p className="flex flex-wrap gap-1.5">
            {cancelled && (
              <span className="rounded bg-danger/15 px-1.5 text-[10px] font-semibold tracking-wide text-danger uppercase">
                Cancelled
              </span>
            )}
            {attachment.visibility === "public" && !cancelled && (
              <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 text-[10px] font-semibold tracking-wide text-accent-bright uppercase">
                <Globe aria-hidden className="size-2.5" />
                On Discover
              </span>
            )}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CalendarDays aria-hidden className="size-3.5 shrink-0" />
          <time dateTime={new Date(startTime).toISOString()}>
            {formatEventWhen(startTime, endTime, allDay)}
          </time>
        </p>
        {(location || locationUrl) && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {locationUrl ? (
              <a
                href={locationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-accent-bright hover:underline"
              >
                {location || "Join link"}
              </a>
            ) : (
              <span className="truncate">{location}</span>
            )}
          </p>
        )}
        {!cancelled && reminders && reminders.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Bell aria-hidden className="size-3.5 shrink-0" />
            {reminders.length === 1 ? "Reminder" : `${reminders.length} reminders`} at{" "}
            {reminders.map((at) => formatDateTime(at)).join(", ")}
            {attachment.remindGoingOnly && " (for people going)"}
          </p>
        )}
        {description && <p className="pt-1 text-sm">{description}</p>}
        {rsvp ? (
          <Rsvp event={attachment} context={rsvp} />
        ) : (
          attendees &&
          attendees.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Users aria-hidden className="size-3.5 shrink-0" />
              {attendees.length} going
            </p>
          )
        )}
      </div>
    </article>
  );
}

/** Who's going, and your own Going toggle (until it's over or cancelled). */
function Rsvp({ event, context }: { event: EventAttachment; context: RsvpContext }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const attendees = event.attendees ?? [];
  const going = attendees.includes(context.selfId);
  // When the card was shown (an answer after the end is refused by the server anyway).
  const [shownAt] = useState(() => Date.now());
  // Answers stay visible after the event; they just can't change.
  const open = !event.cancelled && eventEnd(event) >= shownAt;
  const names = attendees.map((id) => (id === context.selfId ? "You" : authorName(context.users[id], id)));

  async function toggle() {
    setBusy(true);
    setError(undefined);
    setError(await context.onRsvp(!going));
    setBusy(false);
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="flex items-center gap-2">
        {open && (
          <button
            type="button"
            aria-pressed={going}
            disabled={busy}
            onClick={() => void toggle()}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-50",
              going ? "bg-accent text-accent-foreground hover:opacity-90" : "border border-border hover:bg-surface-2",
            )}
          >
            {going && <Check aria-hidden className="size-3.5" />}
            {going ? "Going" : "I'm going"}
          </button>
        )}
        {attendees.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="flex -space-x-1.5">
              {attendees.slice(0, 5).map((id) => {
                const user = context.users[id];
                return (
                  <Avatar
                    key={id}
                    name={authorName(user, id)}
                    color={user?.color ?? "#6b7280"}
                    src={user?.avatarUrl}
                    size="xs"
                    className="size-5 ring-2 ring-surface"
                  />
                );
              })}
            </span>
            <span className="truncate" title={names.join(", ")}>
              {attendees.length} going
            </span>
          </span>
        ) : (
          open && <span className="text-xs text-muted">Be the first to say you&apos;re going.</span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
