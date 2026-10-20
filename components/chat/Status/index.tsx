"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Radio from "@/components/form/Radio";
import Select from "@/components/form/Select";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import {
  MAX_STATUS_TEXT_LENGTH,
  PRESENCES,
  type Presence,
  type User,
  type UserStatus,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export const PRESENCE_LABELS: Record<Presence, { label: string; description: string; dot: string }> = {
  online: { label: "Online", description: "Shows as away when you've been idle a while.", dot: "bg-online" },
  away: { label: "Away", description: "Still here, just not at your desk.", dot: "bg-warning" },
  dnd: { label: "Do not disturb", description: "No notification popups. Badges still count.", dot: "bg-danger-strong" },
  invisible: { label: "Invisible", description: "Everyone sees you as offline.", dot: "bg-muted" },
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do not disturb",
  offline: "Offline",
};

/** Someone's custom status, e.g. "🌴 On vacation"; nothing when they have none. */
export function CustomStatus({ user, className }: { user: Pick<User, "statusEmoji" | "statusText">; className?: string }) {
  if (!user.statusEmoji && !user.statusText) return null;
  return (
    <span className={cn("block truncate", className)} title={user.statusText}>
      {user.statusEmoji && <span className="mr-1">{user.statusEmoji}</span>}
      {user.statusText}
    </span>
  );
}

const SUGGESTIONS: [emoji: string, text: string][] = [
  ["📅", "In a meeting"],
  ["🚌", "Commuting"],
  ["🤒", "Out sick"],
  ["🌴", "On vacation"],
  ["🏠", "Working remotely"],
];

const MINUTE = 60 * 1000;
const CLEAR_AFTER: { label: string; at: () => number | null }[] = [
  { label: "Don't clear", at: () => null },
  { label: "30 minutes", at: () => Date.now() + 30 * MINUTE },
  { label: "1 hour", at: () => Date.now() + 60 * MINUTE },
  { label: "4 hours", at: () => Date.now() + 240 * MINUTE },
  {
    label: "Today",
    at: () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return end.getTime();
    },
  },
];

export type StatusChanges = { presence: Presence; text: string | null; emoji: string | null; until: number | null };

/**
 * Pick your presence and set (or clear) a custom status (a section of the
 * settings screen). It saves in place; given `onClose`, it offers Cancel and
 * closes once saved instead.
 */
export function StatusForm({ onClose }: { onClose?: () => void }) {
  const { state, setStatus: onSave } = useChatContext();
  const savedPresence = state.presence;
  const self = state.users[state.selfId];
  const [presence, setPresence] = useState(savedPresence);
  const [emoji, setEmoji] = useState(self.statusEmoji ?? "");
  const [text, setText] = useState(self.statusText ?? "");
  const [clearAfter, setClearAfter] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const ids = { presence: useId(), emoji: useId(), text: useId(), clear: useId() };
  const hasCustom = Boolean(emoji.trim() || text.trim());

  async function save(changes: StatusChanges) {
    setBusy(true);
    setError(undefined);
    const failure = await onSave(changes);
    setBusy(false);
    if (failure) return setError(failure);
    if (onClose) return onClose();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save({
          presence,
          emoji: emoji.trim() || null,
          text: text.trim() || null,
          until: hasCustom ? CLEAR_AFTER[clearAfter].at() : null,
        });
      }}
      className="space-y-5"
    >
      <fieldset>
        <legend id={ids.presence} className="mb-2 text-sm font-medium">
          Presence
        </legend>
        <Radio.Group
          type="button"
          orientation="vertical"
          value={presence}
          onChange={setPresence}
          aria-labelledby={ids.presence}
          className="gap-1.5"
        >
          {PRESENCES.map((option) => (
            <Radio
              key={option}
              value={option}
              icon={<span aria-hidden className={cn("mt-0.5 size-2.5 rounded-full", PRESENCE_LABELS[option].dot)} />}
              description={PRESENCE_LABELS[option].description}
            >
              {PRESENCE_LABELS[option].label}
            </Radio>
          ))}
        </Radio.Group>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Custom status</legend>
        <div className="flex gap-2">
          <Field label="Emoji" htmlFor={ids.emoji} className="w-20 shrink-0">
            <Input
              id={ids.emoji}
              value={emoji}
              maxLength={16}
              placeholder="💬"
              onChange={(event) => setEmoji(event.target.value)}
              className="text-center"
            />
          </Field>
          <Field label="What's going on?" htmlFor={ids.text} className="min-w-0 flex-1">
            <Input
              id={ids.text}
              value={text}
              maxLength={MAX_STATUS_TEXT_LENGTH}
              placeholder="e.g. Heads down until 3pm"
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(([suggestedEmoji, suggestedText]) => (
            <button
              key={suggestedText}
              type="button"
              onClick={() => {
                setEmoji(suggestedEmoji);
                setText(suggestedText);
              }}
              className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
            >
              {suggestedEmoji} {suggestedText}
            </button>
          ))}
        </div>
        <Field label="Clear after" htmlFor={ids.clear}>
          <Select
            id={ids.clear}
            value={String(clearAfter)}
            disabled={!hasCustom}
            onChange={(next) => setClearAfter(Number(next ?? 0))}
            options={CLEAR_AFTER.map((option, index) => ({ value: String(index), label: option.label }))}
          />
        </Field>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {(self.statusEmoji || self.statusText) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ presence, emoji: null, text: null, until: null })}
            className="h-9 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Clear status
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">
          <SavedNote show={saved} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
          >
            {busy ? "Saving…" : onClose ? "Save" : "Save changes"}
          </button>
        </span>
      </div>
    </form>
  );
}

/** "Saved", for a moment after a form on the settings screen saves. */
function SavedNote({ show }: { show: boolean }) {
  return show ? (
    <p role="status" className="mr-auto flex items-center gap-1.5 text-sm text-muted">
      <Check aria-hidden className="size-4 text-online" />
      Saved
    </p>
  ) : null;
}
