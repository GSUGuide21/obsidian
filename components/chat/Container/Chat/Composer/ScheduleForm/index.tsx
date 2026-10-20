"use client";

import { useState } from "react";
import DateTimeInput from "@/components/form/DateTime";
import Field from "@/components/form/Field";
import { MAX_SCHEDULE_AHEAD } from "@/lib/chat/types";
import { FormActions } from "../OptionsForm";

/** The next whole hour, at least a few minutes away. */
function nextHour() {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.getTime();
}

/** Pick when to send the message. */
export default function ScheduleForm({
  onSubmit,
  onCancel,
}: {
  /** Resolves to an error message. */
  onSubmit: (sendAt: number) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [sendAt, setSendAt] = useState<number | null>(nextHour);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // When the form opened: the earliest it may be sent is a minute after.
  const [openedAt] = useState(() => Date.now());

  async function submit() {
    if (sendAt === null) return setError("Pick when to send it.");
    if (sendAt < Date.now() + 60_000) return setError("Pick a time at least a minute from now.");
    if (sendAt > Date.now() + MAX_SCHEDULE_AHEAD) return setError("Pick a time within 30 days.");
    setBusy(true);
    setError(undefined);
    const failure = await onSubmit(sendAt);
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void submit();
      }}
      className="space-y-4"
    >
      <Field label="Send at" htmlFor="schedule-at" hint="It's posted then, if you can still post here.">
        <DateTimeInput id="schedule-at" value={sendAt} onChange={setSendAt} min={openedAt + 60_000} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <FormActions onCancel={onCancel} label={busy ? "Scheduling…" : "Schedule"} />
    </form>
  );
}
