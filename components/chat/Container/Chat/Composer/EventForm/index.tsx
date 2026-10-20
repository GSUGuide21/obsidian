"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import Checkbox from "@/components/form/Checkbox";
import DateInput, { fromDateString, toDateString } from "@/components/form/Date";
import DateTimeInput from "@/components/form/DateTime";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Switch from "@/components/form/Switch";
import TextArea from "@/components/form/TextArea";
import type { EventAttachment } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { FormActions } from "../OptionsForm";

/** The start of the timestamp's day (local midnight). */
function startOfDay(timestamp: number) {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The fields an error can be about, and their controls' ids (to focus the one at fault). */
type EventField = "title" | "start" | "end" | "link";
const FIELD_IDS: Record<EventField, string> = {
  title: "event-title",
  start: "event-start",
  end: "event-end",
  link: "event-link",
};

const MINUTE = 60 * 1000;
/** Reminder choices, as time before the start. */
const REMINDERS = [
  { label: "At the start", before: 0 },
  { label: "15 minutes before", before: 15 * MINUTE },
  { label: "1 hour before", before: 60 * MINUTE },
  { label: "1 day before", before: 24 * 60 * MINUTE },
];

function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.getTime();
}

/** The reminder choices an existing event's reminder times match. */
function remindersOf(event: EventAttachment) {
  const offsets = new Set((event.reminders ?? []).map((at) => event.startTime - at));
  return new Set(REMINDERS.map((r) => r.before).filter((before) => offsets.has(before)));
}

export default function EventForm({
  initial,
  submitLabel = "Add event",
  onSubmit,
  onCancel,
}: {
  /** The event being edited; absent for a new one. */
  initial?: EventAttachment;
  submitLabel?: string;
  /** Resolves to an error message to show, if any. */
  onSubmit: (attachment: EventAttachment) => void | Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  // Timestamps; `null` while empty. All-day events keep them at midnight.
  const [start, setStart] = useState<number | null>(() => initial?.startTime ?? nextHour());
  const [end, setEnd] = useState<number | null>(() =>
    initial ? (initial.endTime ?? null) : nextHour() + 60 * 60 * 1000,
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [locationUrl, setLocationUrl] = useState(initial?.locationUrl ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  /** Chosen reminders, as time before the start. */
  const [reminders, setReminders] = useState<ReadonlySet<number>>(() =>
    initial ? remindersOf(initial) : new Set([15 * MINUTE]),
  );
  // Events stay within their group unless listed on the discover page.
  const [listed, setListed] = useState(initial?.visibility === "public");
  // Reminders go to everyone in the channel unless only to those who say they're going.
  const [goingOnly, setGoingOnly] = useState(initial?.remindGoingOnly ?? false);
  const [busy, setBusy] = useState(false);
  // What's wrong: about one field (shown under it), or the whole event (`field` absent, e.g. from the server).
  const [error, setError] = useState<{ field?: EventField; message: string }>();
  const errorFor = (field: EventField) => (error?.field === field ? error.message : undefined);
  /** A field was changed: its error goes. */
  const edited = (field: EventField) => {
    if (error?.field === field) setError(undefined);
  };

  /** Show what's wrong where it is, and put the cursor there. */
  function fail(field: EventField, message: string) {
    setError({ field, message });
    document.getElementById(FIELD_IDS[field])?.focus();
  }

  function toggleReminder(before: number, on: boolean) {
    setReminders((current) => {
      const next = new Set(current);
      if (on) next.add(before);
      else next.delete(before);
      return next;
    });
  }

  function toggleAllDay(next: boolean) {
    // Keep the chosen dates; an all-day event starts and ends at midnight.
    if (next) {
      if (start !== null) setStart(startOfDay(start));
      if (end !== null) setEnd(startOfDay(end));
    }
    setAllDay(next);
  }

  async function submit() {
    const startTime = start;
    const endTime = end ?? undefined;
    if (!title.trim()) return fail("title", "Add a title.");
    if (startTime === null) return fail("start", allDay ? "Pick a date." : "Pick a start time.");
    if (endTime !== undefined && endTime < startTime) return fail("end", "The end can't be before the start.");
    let link: string | undefined;
    if (locationUrl.trim()) {
      try {
        const parsed = new URL(locationUrl.trim());
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
        link = parsed.href;
      } catch {
        return fail("link", "Links start with https:// (or http://).");
      }
    }
    // Only reminders still ahead are kept (an event starting in 10 minutes can't remind an hour before).
    const now = Date.now();
    const times = [...reminders].map((before) => startTime - before).filter((at) => at > now).sort((a, b) => a - b);
    // Ask for system notifications while the click still counts as a user gesture;
    // reminders also show inside the app either way.
    if (times.length > 0 && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setError(undefined);
    setBusy(true);
    const failure = await onSubmit({
      type: "event",
      title: title.trim(),
      startTime,
      ...(endTime !== undefined && { endTime }),
      ...(allDay && { allDay }),
      ...(location.trim() && { location: location.trim() }),
      ...(link && { locationUrl: link }),
      ...(description.trim() && { description: description.trim() }),
      ...(times.length > 0 && { reminders: times }),
      ...(times.length > 0 && goingOnly && { remindGoingOnly: true as const }),
      ...(listed && { visibility: "public" as const }),
    });
    setBusy(false);
    if (failure) setError({ message: failure });
  }

  /** The date (all day) or date-and-time box for `value`. */
  const when = (id: string, value: number | null, onChange: (value: number | null) => void) =>
    allDay ? (
      <DateInput
        id={id}
        value={value === null ? null : toDateString(value)}
        onChange={(date) => onChange(date === null ? null : fromDateString(date))}
      />
    ) : (
      <DateTimeInput id={id} value={value} onChange={onChange} />
    );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void submit();
      }}
      className="space-y-4"
    >
      <Field label="Title" htmlFor={FIELD_IDS.title} error={errorFor("title")}>
        <Input
          id={FIELD_IDS.title}
          autoFocus
          maxLength={200}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            edited("title");
          }}
          placeholder="Design review"
        />
      </Field>

      <Switch checked={allDay} onChange={toggleAllDay}>
        All day
      </Switch>

      {/* Dates fit side by side; a date and time is too wide for half the dialog. */}
      <div className={cn("grid gap-4", allDay && "sm:grid-cols-2")}>
        <Field label="Starts" htmlFor={FIELD_IDS.start} error={errorFor("start")}>
          {when(FIELD_IDS.start, start, (value) => {
            setStart(value);
            edited("start");
          })}
        </Field>
        <Field label="Ends" htmlFor={FIELD_IDS.end} optional error={errorFor("end")}>
          {when(FIELD_IDS.end, end, (value) => {
            setEnd(value);
            edited("end");
          })}
        </Field>
      </div>

      <Field label="Location" htmlFor="event-location" optional>
        <Input
          id="event-location"
          maxLength={200}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Studio B, or Video call"
        />
      </Field>
      <Field label="Location link" htmlFor={FIELD_IDS.link} optional hint="A meeting link, say." error={errorFor("link")}>
        <Input
          id={FIELD_IDS.link}
          type="url"
          inputMode="url"
          value={locationUrl}
          onChange={(event) => {
            setLocationUrl(event.target.value);
            edited("link");
          }}
          placeholder="https://"
        />
      </Field>
      <Field label="Description" htmlFor="event-description" optional>
        <TextArea
          id="event-description"
          rows={3}
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Reminders</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {REMINDERS.map(({ label, before }) => (
            <Checkbox key={before} checked={reminders.has(before)} onChange={(on) => toggleReminder(before, on)}>
              {label}
            </Checkbox>
          ))}
        </div>
        {reminders.size > 0 && (
          <Switch
            checked={goingOnly}
            onChange={setGoingOnly}
            description={
              goingOnly ? "People answer with the Going button on the event." : "Everyone in the channel gets the reminders."
            }
            className="mt-3"
          >
            Only remind people who are going
          </Switch>
        )}
      </fieldset>

      <Switch
        checked={listed}
        onChange={setListed}
        description="Anyone can find it on the Discover page. Only works in public groups; otherwise only the group sees it."
      >
        Show on Discover
      </Switch>

      {error && !error.field && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      )}
      <FormActions onCancel={onCancel} label={submitLabel} />
    </form>
  );
}
