"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { CircleAlert, FileX, ImagePlus, Loader2, Search, Smile, Trash, X } from "lucide-react";
import Input from "@/components/form/Input";
import { isEmojiName, MAX_CUSTOM_EMOJI, type CustomEmoji } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/** What the server accepts (it checks again). */
export const EMOJI_TYPES = ["image/png", "image/gif", "image/webp", "image/jpeg"];
export const MAX_EMOJI_BYTES = 512 * 1024;
/** Past this many, the library gets a search box. */
const SEARCH_FROM = 12;

type EmojiSettingsProps = {
  emoji: CustomEmoji[];
  /** Upload an image; resolves to its URL (rejects with the reason). */
  onUpload: (file: File) => Promise<string>;
  /** Add an uploaded image as :name:; resolves to an error message. */
  onAdd: (name: string, url: string) => Promise<string | undefined>;
  onRemove: (name: string) => Promise<string | undefined>;
};

/** An image picked to add, until it's added (or removed from the list). */
type Pending = {
  key: string;
  file: File;
  /** Object URL for the preview. */
  preview: string;
  name: string;
  /** Why it can't be added (as picked, or as the server said). */
  error?: string;
  busy?: boolean;
};

/** A file name as an emoji name: "Party Parrot (1).gif" → "party_parrot_1". */
export function emojiNameFrom(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
}

/** What's wrong with adding this image as `name`, if anything. */
function problem(pending: Pending, taken: Set<string>) {
  if (!EMOJI_TYPES.includes(pending.file.type)) return "Use a PNG, GIF, WebP or JPEG image.";
  if (pending.file.size > MAX_EMOJI_BYTES) return "Emoji images can be up to 512 KB.";
  if (!isEmojiName(pending.name)) return "Names are 2–32 lowercase letters, numbers or underscores.";
  if (taken.has(pending.name)) return `:${pending.name}: is already taken.`;
  return undefined;
}

/**
 * A group's custom emoji (a group settings section): add several at once by
 * dropping or picking images (each named from its file, editable, previewed
 * as it'll look), and browse, search and remove the ones there are. Changes
 * apply right away.
 */
export default function EmojiSettings({ emoji, onUpload, onAdd, onRemove }: EmojiSettingsProps) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(pending);
  const searchId = useId();
  const dropHintId = useId();

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  // Free the previews when leaving.
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const room = MAX_CUSTOM_EMOJI - emoji.length;
  const existing = new Set(emoji.map((e) => e.name));
  // A name is taken by an existing emoji, or by another image above it in the list.
  const checked = pending.map((item, index) => {
    const taken = new Set([...existing, ...pending.slice(0, index).map((p) => p.name)]);
    return { ...item, problem: item.error ?? problem(item, taken) };
  });
  const ready = checked.filter((item) => !item.problem);
  const toAdd = ready.slice(0, Math.max(0, room));

  function pick(files: File[]) {
    setError(undefined);
    const images = files.slice(0, 50);
    setPending((list) => [
      ...list,
      ...images.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: URL.createObjectURL(file),
        name: emojiNameFrom(file.name),
      })),
    ]);
  }

  function discard(key: string) {
    setPending((list) => {
      const item = list.find((p) => p.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter((p) => p.key !== key);
    });
  }

  function rename(key: string, name: string) {
    const clean = name.trim().toLowerCase().replace(/^:|:$/g, "");
    setPending((list) => list.map((p) => (p.key === key ? { ...p, name: clean, error: undefined } : p)));
  }

  /** Upload and add every ready image, one by one; the ones that fail stay with their reason. */
  async function addAll() {
    setAdding(true);
    setError(undefined);
    for (const item of toAdd) {
      setPending((list) => list.map((p) => (p.key === item.key ? { ...p, busy: true } : p)));
      let failure: string | undefined;
      try {
        const url = await onUpload(item.file);
        failure = await onAdd(item.name, url);
      } catch (uploadError) {
        failure = uploadError instanceof Error ? uploadError.message : "Upload failed.";
      }
      if (failure) setPending((list) => list.map((p) => (p.key === item.key ? { ...p, busy: false, error: failure } : p)));
      else discard(item.key);
    }
    setAdding(false);
  }

  async function remove(name: string) {
    setBusyName(name);
    setError(undefined);
    const failure = await onRemove(name);
    setBusyName(null);
    setRemoving(null);
    if (failure) setError(failure);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick([...event.dataTransfer.files]);
  }

  const needle = query.trim().toLowerCase().replace(/^:|:$/g, "");
  const shown = needle ? emoji.filter((e) => e.name.includes(needle)) : emoji;

  return (
    <div className="space-y-8">
      {/* Adding */}
      <section aria-labelledby={`${dropHintId}-title`} className="space-y-3">
        <h3 id={`${dropHintId}-title`} className="sr-only">
          Add emoji
        </h3>
        {room > 0 ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-accent bg-accent/10" : "border-input/50 hover:border-input",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent-bright">
              <ImagePlus aria-hidden className="size-5" />
            </span>
            <p className="text-sm">
              Drop images here, or{" "}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-describedby={dropHintId}
                className="font-medium text-accent-bright hover:underline"
              >
                choose files
              </button>
            </p>
            <p id={dropHintId} className="text-xs text-muted">
              PNG, GIF, WebP or JPEG, up to 512 KB each. Square images look best. Each is named after its file; you
              can change it.
            </p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={EMOJI_TYPES.join(",")}
              hidden
              onChange={(event) => {
                pick([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </div>
        ) : (
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
            This group has all {MAX_CUSTOM_EMOJI} custom emoji it can have. Remove one to add another.
          </p>
        )}

        {checked.length > 0 && (
          <div className="rounded-xl border border-border bg-surface">
            <ul aria-label="Emoji to add" className="divide-y divide-border">
              {checked.map((item) => {
                const inputId = `emoji-name-${item.key}`;
                const errorId = `${inputId}-error`;
                // Only images get a preview (a text file can't show as one).
                const image = item.file.type.startsWith("image/");
                return (
                  <li key={item.key} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local preview
                        <img src={item.preview} alt="" className="size-8 object-contain" />
                      ) : (
                        <FileX aria-label="Not an image" className="size-5 text-muted" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 basis-48">
                      <label htmlFor={inputId} className="sr-only">
                        Name for {item.file.name}
                      </label>
                      <div className="flex items-center gap-1 font-mono text-sm">
                        <span aria-hidden className="text-muted">:</span>
                        <Input
                          id={inputId}
                          size="sm"
                          value={item.name}
                          maxLength={34}
                          disabled={item.busy}
                          aria-invalid={item.problem ? true : undefined}
                          aria-describedby={item.problem ? errorId : undefined}
                          onChange={(event) => rename(item.key, event.target.value)}
                          className="font-mono"
                        />
                        <span aria-hidden className="text-muted">:</span>
                      </div>
                      {item.problem ? (
                        <p id={errorId} className="mt-1 flex items-start gap-1.5 text-xs text-danger">
                          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                          {item.problem}
                        </p>
                      ) : (
                        <p className="mt-1 truncate text-xs text-muted">{item.file.name}</p>
                      )}
                    </div>
                    {/* How it'll look: in a message, and as a reaction. */}
                    <div aria-hidden className={cn("hidden shrink-0 items-center gap-2 text-sm", image && "md:flex")}>
                      <span className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1">
                        Nice
                        {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                        <img src={item.preview} alt="" className="inline size-5 object-contain" />
                      </span>
                      <span className="flex items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-xs">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                        <img src={item.preview} alt="" className="size-4 object-contain" />3
                      </span>
                    </div>
                    {item.busy ? (
                      <Loader2 aria-label="Adding" className="size-4 shrink-0 animate-spin text-muted" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => discard(item.key)}
                        disabled={adding}
                        aria-label={`Don't add ${item.file.name}`}
                        className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2.5">
              <p className="mr-auto text-xs text-muted">
                {ready.length > room
                  ? `Only ${room} more fit: the first ${room} ready ${room === 1 ? "one is" : "ones are"} added.`
                  : ready.length < checked.length
                    ? `${ready.length} of ${checked.length} ready. Fix or remove the others.`
                    : `${ready.length} ready to add.`}
              </p>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => pending.forEach((p) => discard(p.key))}
                  className="h-8 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={adding || toAdd.length === 0}
                  onClick={() => void addAll()}
                  className="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
                >
                  {adding ? "Adding…" : toAdd.length > 0 ? `Add ${toAdd.length} emoji` : "Add emoji"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* The library */}
      <section aria-labelledby={`${searchId}-title`} className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id={`${searchId}-title`} className="text-sm font-medium">
            In this group
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span
              role="meter"
              aria-label="Custom emoji used"
              aria-valuemin={0}
              aria-valuemax={MAX_CUSTOM_EMOJI}
              aria-valuenow={emoji.length}
              className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2"
            >
              <span
                className={cn("block h-full rounded-full", room <= 5 ? "bg-warning" : "bg-accent")}
                style={{ width: `${(emoji.length / MAX_CUSTOM_EMOJI) * 100}%` }}
              />
            </span>
            <span className="tabular-nums">
              {emoji.length} of {MAX_CUSTOM_EMOJI}
            </span>
          </div>
          {emoji.length >= SEARCH_FROM && (
            <div className="relative ml-auto w-full sm:w-56">
              <label htmlFor={searchId} className="sr-only">
                Search emoji
              </label>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
              <Input
                id={searchId}
                size="sm"
                type="search"
                value={query}
                placeholder="Search emoji"
                onChange={(event) => setQuery(event.target.value)}
                className="pl-8"
              />
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        {emoji.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2/60 px-4 py-8 text-center">
            <Smile aria-hidden className="size-6 text-muted" />
            <p className="text-sm font-medium">No custom emoji yet</p>
            <p className="max-w-xs text-xs text-muted">
              Add some above, and members can use them as :name: in messages and as reactions.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No emoji match “{query.trim()}”.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
            {shown.map((e) => (
              <li
                key={e.name}
                className="group/tile relative flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-3 pt-4"
              >
                {removing === e.name ? (
                  <div className="flex min-h-[4.75rem] w-full flex-col items-center justify-center gap-2 text-center">
                    <p className="text-xs">
                      Remove <span className="font-mono">:{e.name}:</span>?
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        autoFocus
                        onClick={() => setRemoving(null)}
                        className="h-7 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        disabled={busyName === e.name}
                        onClick={() => void remove(e.name)}
                        className="h-7 rounded-md bg-danger-strong px-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busyName === e.name ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded emoji */}
                    <img src={e.url} alt="" loading="lazy" className="size-10 object-contain" />
                    <span className="w-full truncate text-center font-mono text-xs" title={`:${e.name}:`}>
                      :{e.name}:
                    </span>
                    <button
                      type="button"
                      onClick={() => setRemoving(e.name)}
                      aria-label={`Remove :${e.name}:`}
                      title="Remove"
                      className="absolute top-1 right-1 rounded-md p-1 text-muted opacity-0 transition-opacity group-hover/tile:opacity-100 hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 pointer-coarse:opacity-100"
                    >
                      <Trash className="size-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          Removing one doesn&apos;t change messages or reactions that used it; they show its :name: as text instead.
        </p>
      </section>
    </div>
  );
}
