"use client";

import { useState } from "react";
import { Hourglass } from "lucide-react";
import Radio from "@/components/form/Radio";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { formatDisappear } from "@/lib/chat/format";
import { DISAPPEAR_TIMES, type Subgroup } from "@/lib/chat/types";

/**
 * The open channel's disappearing messages timer (a group settings section):
 * for anyone in a direct message, and those who manage a group (who also
 * have it in the channel's settings). It applies as soon as it's picked.
 */
export default function DisappearingSettings({ subgroup, dm }: { subgroup: Subgroup; dm: boolean }) {
  const { setDisappearing } = useChatContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const current = subgroup.disappearAfter ?? 0;

  async function pick(after: number) {
    setBusy(true);
    setError(undefined);
    setError(await setDisappearing(subgroup.id, after));
    setBusy(false);
  }

  return (
    <section aria-label="Disappearing messages" className="space-y-3">
      <p className="text-xs text-muted">
        Messages {dm ? "in this conversation" : `in #${subgroup.name}`} are deleted for everyone once they&apos;re this
        old, with their files. A thread stays until its last reply goes. Everyone {dm ? "here" : "in the channel"} sees
        when it&apos;s changed.
      </p>
      <Radio.Group
        type="button"
        orientation="vertical"
        value={String(current)}
        onChange={(value) => void pick(Number(value))}
        aria-label="Delete messages"
        className="gap-1.5"
      >
        {DISAPPEAR_TIMES.map((seconds) => (
          <Radio
            key={seconds}
            value={String(seconds)}
            disabled={busy}
            icon={seconds > 0 ? <Hourglass aria-hidden className="size-4 text-muted group-data-checked:text-accent-bright" /> : undefined}
            description={seconds === 0 ? "Messages stay until someone deletes them." : undefined}
          >
            {seconds === 0 ? "Off" : `After ${formatDisappear(seconds)}`}
          </Radio>
        ))}
      </Radio.Group>
      {current === 0 && (
        <p className="text-xs text-muted">
          Turning it on applies to what&apos;s already here too: older messages are deleted within a minute, and
          can&apos;t be brought back.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
