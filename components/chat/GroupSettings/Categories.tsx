"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Check, FolderClosed, Pencil, Plus, Trash, X } from "lucide-react";
import Input from "@/components/form/Input";
import { categoryOrder } from "@/lib/chat/order";
import { MAX_CATEGORIES, MAX_CATEGORY_LENGTH, type Group } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/** Resolves to an error message, or undefined on success. */
type Action<A extends unknown[]> = (...args: A) => Promise<string | undefined>;

type CategoriesProps = {
  group: Group;
  onCreate: Action<[name: string]>;
  onRename: Action<[from: string, to: string]>;
  onDelete: Action<[name: string]>;
  /** Move `name`, with its channels, before `before` (null: last). */
  onMove: Action<[name: string, before: string | null]>;
};

/** A group's categories: its sidebar sections, in order. Make, rename, reorder and delete them. */
export default function CategoriesSettings({ group, onCreate, onRename, onDelete, onMove }: CategoriesProps) {
  const categories = categoryOrder(group);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ name: string; draft: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const addId = useId();
  const full = categories.length >= MAX_CATEGORIES;
  const countIn = (name: string) => group.subgroups.filter((s) => s.category === name).length;

  async function run(action: Promise<string | undefined>) {
    setBusy(true);
    setError(undefined);
    const failure = await action;
    setBusy(false);
    setError(failure);
    return failure;
  }

  async function add() {
    const name = adding.trim().replace(/\s+/g, " ");
    if (!name || busy) return;
    if (!(await run(onCreate(name)))) setAdding("");
  }

  async function rename() {
    if (!editing || busy) return;
    const to = editing.draft.trim().replace(/\s+/g, " ");
    if (!to) return;
    if (!(await run(onRename(editing.name, to)))) setEditing(null);
  }

  function move(index: number, by: -1 | 1) {
    // Down by one is before the category two places down (or last).
    const before = by === -1 ? categories[index - 1] : (categories[index + 2] ?? null);
    void run(onMove(categories[index], before));
  }

  return (
    <section aria-label="Categories" className="space-y-4">
      <p className="text-xs text-muted">
        Categories are the sections of the group in the sidebar. Channels outside any category are listed first. You can
        also drag categories and channels in the sidebar.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <FolderClosed aria-hidden className="mx-auto mb-2 size-6 text-muted" />
          <p className="text-sm font-medium">No categories yet</p>
          <p className="mt-1 text-xs text-muted">Make one, like “Projects”, then put channels in it.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-busy={busy}>
          {categories.map((name, index) => {
            const count = countIn(name);
            return (
              <li key={name} className="flex items-center gap-3 px-3 py-2.5">
                {editing?.name === name ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename();
                    }}
                  >
                    <Input
                      size="sm"
                      autoFocus
                      aria-label={`New name for ${name}`}
                      maxLength={MAX_CATEGORY_LENGTH}
                      value={editing.draft}
                      onChange={(event) => setEditing({ name, draft: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setEditing(null);
                        }
                      }}
                    />
                    <IconButton label="Save name" submit disabled={!editing.draft.trim() || busy}>
                      <Check className="size-4" />
                    </IconButton>
                    <IconButton label="Cancel" onClick={() => setEditing(null)}>
                      <X className="size-4" />
                    </IconButton>
                  </form>
                ) : (
                  <>
                    <FolderClosed aria-hidden className="size-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted">
                        {count === 0 ? "Empty" : `${count} ${count === 1 ? "channel" : "channels"}`}
                      </p>
                    </div>
                    {confirming === name ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="text-xs text-muted">
                          {count > 0 ? "Delete it? Its channels stay, uncategorized." : "Delete it?"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirming(null);
                            void run(onDelete(name));
                          }}
                          className="h-7 rounded-md bg-danger-strong px-2 text-xs font-medium text-white hover:opacity-90"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="h-7 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center">
                        <IconButton label={`Move ${name} up`} disabled={index === 0 || busy} onClick={() => move(index, -1)}>
                          <ArrowUp className="size-4" />
                        </IconButton>
                        <IconButton
                          label={`Move ${name} down`}
                          disabled={index === categories.length - 1 || busy}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </IconButton>
                        <IconButton label={`Rename ${name}`} onClick={() => setEditing({ name, draft: name })}>
                          <Pencil className="size-4" />
                        </IconButton>
                        <IconButton label={`Delete ${name}`} danger onClick={() => setConfirming(name)}>
                          <Trash className="size-4" />
                        </IconButton>
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label htmlFor={addId} className="sr-only">
          New category
        </label>
        <Input
          id={addId}
          maxLength={MAX_CATEGORY_LENGTH}
          placeholder={full ? `Up to ${MAX_CATEGORIES} categories` : "New category, e.g. Projects"}
          disabled={full}
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
        />
        <button
          type="submit"
          disabled={!adding.trim() || busy || full}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus aria-hidden className="size-4" />
          Add category
        </button>
      </form>
    </section>
  );
}

function IconButton({
  label,
  danger,
  disabled,
  submit,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  /** Submits its form instead of `onClick`. */
  submit?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type={submit ? "submit" : "button"}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
