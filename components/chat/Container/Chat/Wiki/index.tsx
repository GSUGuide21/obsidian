"use client";

import { useEffect, useEffectEvent, useId, useState } from "react";
import { BookOpen, Pencil, RotateCcw } from "lucide-react";
import TextArea from "@/components/form/TextArea";
import { authorName, formatRelative } from "@/lib/chat/format";
import { MAX_PAGE_LENGTH, type Subgroup, type User, type WikiPage, type WikiSaveResult } from "@/lib/chat/types";
import type { LinkableChannel } from "@/lib/chat/channelLinks";
import { richEditBlocker } from "@/lib/chat/wikiMarkdown";
import { cn } from "@/lib/utils";
import MarkdownText from "../Message/Markdown";
import WikiEditor from "./Editor";

type WikiProps = {
  subgroup: Subgroup;
  /** `undefined` until fetched. */
  page?: WikiPage;
  users: Record<string, User>;
  selfId: string;
  /** Signed-in members can edit; guests read. */
  canEdit: boolean;
  connected: boolean;
  onLoad: () => void;
  onSave: (body: string, baseVersion: number) => Promise<WikiSaveResult>;
  /** The group's custom emoji (name → image URL), shown as :name: and offered while editing. */
  emoji?: Record<string, string>;
  /** The group's channels you can see: "#name" links to them, and editing suggests them. */
  channels?: LinkableChannel[];
};

/** How the draft is shown: as rich text, as its Markdown, or as the page will look. */
type Mode = "rich" | "markdown" | "preview";

/**
 * `original` is the page text editing started from. `editorKey` changes each
 * time the rich editor opens, so it reads the latest Markdown again.
 */
type Draft = { body: string; original: string; baseVersion: number; mode: Mode; editorKey: number };

const MODES: { mode: Mode; label: string }[] = [
  { mode: "rich", label: "Rich text" },
  { mode: "markdown", label: "Markdown" },
  { mode: "preview", label: "Preview" },
];

/** The shared page of a wiki channel: read it, or edit it as rich text or Markdown (it's kept as Markdown). */
export default function Wiki({ subgroup, page, users, selfId, canEdit, connected, onLoad, onSave, emoji, channels }: WikiProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const load = useEffectEvent(onLoad);
  const editorId = useId();

  // Load on open and after reconnecting (we may have missed updates).
  useEffect(() => {
    if (connected) load();
  }, [subgroup.id, connected]);

  if (!page) {
    return (
      <div className="flex-1 overflow-y-auto" aria-busy>
        <div className="mx-auto max-w-3xl space-y-3 px-6 py-10">
          <div className="h-8 w-1/3 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-surface-2" />
          <span className="sr-only">Loading the page</span>
        </div>
      </div>
    );
  }

  const dirty = draft !== null && draft.body !== draft.original;
  // What would keep the rich editor from showing the draft, if anything.
  const blocker = draft ? richEditBlocker(draft.body) : undefined;
  // While saving, our own save's broadcast can arrive before its reply.
  const stale = draft !== null && !saving && page.version !== draft.baseVersion;
  const editor = page.updatedBy ? authorName(users[page.updatedBy], page.updatedBy) : undefined;

  function startEditing() {
    if (!page) return;
    setError(undefined);
    // Pages with Markdown the rich editor can't show open as Markdown.
    const mode = richEditBlocker(page.body) ? "markdown" : "rich";
    setDraft({ body: page.body, original: page.body, baseVersion: page.version, mode, editorKey: Date.now() });
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    const result = await onSave(draft.body, draft.baseVersion);
    setSaving(false);
    if (result.ok) {
      setDraft(null);
      setError(undefined);
    } else {
      setError(result.error);
    }
  }

  if (draft) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <div role="tablist" aria-label="Editor mode" className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium">
            {MODES.map(({ mode, label }) => {
              const selected = draft.mode === mode;
              // The rich editor would drop what it can't show; such pages stay in Markdown.
              const unavailable = mode === "rich" && !selected && blocker !== undefined;
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  disabled={unavailable}
                  title={unavailable ? `The page has ${blocker}, which only Markdown can edit` : undefined}
                  onClick={() =>
                    setDraft({ ...draft, mode, ...(mode === "rich" && draft.mode !== "rich" && { editorKey: Date.now() }) })
                  }
                  className={cn(
                    "rounded-md px-3 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    selected ? "bg-surface text-foreground shadow-sm" : "text-muted enabled:hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {draft.mode !== "rich" && blocker && (
            <span className="text-xs text-muted">Has {blocker}: edit it as Markdown</span>
          )}
          <span
            className={cn(
              "ml-auto text-xs tabular-nums",
              draft.body.length > MAX_PAGE_LENGTH - 500 ? "text-danger" : "text-muted",
            )}
          >
            {draft.body.length.toLocaleString()} / {MAX_PAGE_LENGTH.toLocaleString()}
          </span>
        </div>

        {stale && (
          <div role="status" className="flex flex-wrap items-center gap-2 border-b border-border bg-warning/10 px-4 py-2 text-xs">
            <span className="flex-1">
              {editor ?? "Someone"} saved a newer version while you were editing. Copy anything you want to keep, then
              load theirs.
            </span>
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-surface"
            >
              <RotateCcw aria-hidden className="size-3" />
              Load latest
            </button>
          </div>
        )}

        <div className={cn("min-h-0 flex-1", draft.mode === "rich" ? "flex flex-col" : "overflow-y-auto")}>
          {draft.mode === "rich" ? (
            <WikiEditor
              key={draft.editorKey}
              initial={draft.body}
              disabled={saving}
              onChange={(body) => setDraft((current) => current && { ...current, body })}
              emoji={emoji}
              channels={channels}
              onSave={() => void save()}
              onEscape={() => {
                if (!dirty) setDraft(null);
              }}
            />
          ) : draft.mode === "preview" ? (
            <article className="mx-auto max-w-3xl px-6 py-8">
              {draft.body.trim() ? (
                <MarkdownText text={draft.body} mentions={[]} users={users} selfId={selfId} variant="page" emoji={emoji} subgroupId={subgroup.id} />
              ) : (
                <p className="text-sm text-muted italic">Nothing to preview yet.</p>
              )}
            </article>
          ) : (
            <div className="mx-auto h-full max-w-3xl px-4 py-4">
              <label htmlFor={editorId} className="sr-only">
                Page content
              </label>
              <TextArea
                id={editorId}
                autoFocus
                value={draft.body}
                maxLength={MAX_PAGE_LENGTH}
                disabled={saving}
                placeholder={"# Title\n\nWrite in Markdown…"}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void save();
                  } else if (event.key === "Escape" && !dirty) {
                    event.preventDefault();
                    setDraft(null);
                  }
                }}
                className="h-full min-h-80 bg-surface font-mono text-[13px] leading-6"
              />
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {error ? (
            <p role="alert" className="flex-1 text-xs text-danger">
              {error}
            </p>
          ) : (
            <p className="hidden flex-1 text-xs text-muted sm:block">Ctrl+Enter to save</p>
          )}
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setError(undefined);
            }}
            className="ml-auto h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || stale || !connected}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save page"}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-6 flex items-center gap-3 text-xs text-muted">
          <span className="min-w-0 flex-1 truncate">
            {page.updatedAt
              ? `Last edited${editor ? ` by ${editor}` : ""} ${formatRelative(page.updatedAt)}`
              : "Not written yet"}
          </span>
          {canEdit && page.body && (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              <Pencil aria-hidden className="size-3.5" />
              Edit page
            </button>
          )}
        </div>

        {page.body ? (
          <article>
            <MarkdownText text={page.body} mentions={[]} users={users} selfId={selfId} variant="page" emoji={emoji} subgroupId={subgroup.id} />
          </article>
        ) : (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2">
              <BookOpen aria-hidden className="size-6 text-muted" />
            </div>
            <h2 className="font-semibold">#{subgroup.name} has no page yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">
              {canEdit
                ? "Write a shared page for this channel: notes, guides, decisions. Anyone signed in can edit it."
                : "Sign in to write this page."}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={startEditing}
                className="mt-4 h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
              >
                Start writing
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
