"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowLeft, Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsSection<Id extends string> = {
  id: Id;
  label: string;
  /** Under the section's title. */
  description: string;
  icon: LucideIcon;
  /** Beside its label in the list (e.g. a count). */
  badge?: ReactNode;
  /** Shown in the danger color (deleting things). */
  danger?: boolean;
};

export type SettingsGroup<Id extends string> = {
  /** Above its sections; none for a last group set apart by a line. */
  heading: string;
  sections: SettingsSection<Id>[];
};

type SettingsLayoutProps<Id extends string> = {
  /** "Settings", "Group settings"… */
  title: string;
  /** Under the title: what they're the settings of. */
  subtitle?: string;
  /** Before the title (e.g. the group's avatar). */
  leading?: ReactNode;
  /** The sections you can see, under their headings (empty groups are left out). */
  groups: SettingsGroup<Id>[];
  current: Id | undefined;
  onSection: (id: Id) => void;
  /** Back to the chat. */
  onClose: () => void;
  onOpenSidebar: () => void;
  /** The open section's content. */
  children: ReactNode;
};

/**
 * A settings screen in place of the chat (yours, or a chat's): a header with
 * the way back, the sections down the side (a row of tabs on small screens),
 * and the open one beside them. Escape goes back too, unless something on the
 * screen (a field, a menu, a dialog) wants it first.
 */
export default function SettingsLayout<Id extends string>({
  title,
  subtitle,
  leading,
  groups: allGroups,
  current,
  onSection,
  onClose,
  onOpenSidebar,
  children,
}: SettingsLayoutProps<Id>) {
  const groups = allGroups.filter((g) => g.sections.length > 0);
  const sections = groups.flatMap((g) => g.sections);
  const active = sections.find((s) => s.id === current);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role=listbox], [role=menu]")) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <main aria-labelledby="settings-title" className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open groups"
          className="-ml-1.5 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the chat"
          title="Back to the chat (Esc)"
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        {leading}
        <div className="min-w-0 flex-1">
          <h1 id="settings-title" className="truncate leading-tight font-semibold">
            {title}
          </h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </header>

      {!active ? (
        <p className="m-auto px-4 text-sm text-muted">There&apos;s nothing here you can change.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Small screens: the sections as a row of tabs. */}
          <nav aria-label="Settings sections" className="shrink-0 border-b border-border sm:hidden">
            <ul className="flex gap-1 overflow-x-auto px-3 py-2">
              {sections.map((s) => (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onSection(s.id)}
                    aria-current={s.id === current ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm",
                      s.id === current ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:text-foreground",
                      s.danger && s.id !== current && "text-danger",
                    )}
                  >
                    {s.label}
                    {s.badge}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Wider screens: the sections down the side, under their headings. */}
          <nav aria-label="Settings sections" className="hidden w-60 shrink-0 overflow-y-auto border-r border-border p-3 sm:block">
            {groups.map((g, index) => (
              <div key={g.heading || index} className={cn(index > 0 && "mt-4", !g.heading && "border-t border-border pt-4")}>
                {g.heading && (
                  <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{g.heading}</p>
                )}
                <ul className="space-y-0.5">
                  {g.sections.map(({ id, label, icon: Icon, badge, danger }) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onSection(id)}
                        aria-current={id === current ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                          id === current
                            ? "bg-surface-2 font-medium text-foreground"
                            : "text-muted hover:bg-surface-2/60 hover:text-foreground",
                          danger && id !== current && "text-danger hover:text-danger",
                        )}
                      >
                        <Icon aria-hidden className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {badge}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto">
            <section aria-labelledby="settings-section" className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
              <h2 id="settings-section" className="text-lg font-semibold">
                {active.label}
              </h2>
              <p className="mt-1 mb-6 text-sm text-muted">{active.description}</p>
              {children}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

/** A count beside a section's label (e.g. open reports). */
export function SectionBadge({ count, label }: { count: number; label: string }) {
  return (
    <span className="ml-auto rounded-full bg-danger-strong px-1.5 text-[11px] font-semibold text-white tabular-nums">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
