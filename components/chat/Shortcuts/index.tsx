"use client";

import { Fragment, useSyncExternalStore } from "react";
import Dialog from "@/components/Dialog";
import { SHORTCUT_HELP } from "@/lib/chat/shortcuts";

/** Whether this is a Mac (or iPad with a keyboard), where Ctrl is ⌘ and Alt is ⌥. */
function useIsMac() {
  return useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/** Every keyboard shortcut, by where it works (Ctrl+/ or ? opens it). */
export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mac = useIsMac();
  const label = (key: string) => (key === "Mod" ? (mac ? "⌘" : "Ctrl") : key === "Alt" && mac ? "⌥" : key);

  return (
    <Dialog open={open} title="Keyboard shortcuts" onClose={onClose}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {SHORTCUT_HELP.map(({ heading, shortcuts }) => (
          <section key={heading} aria-label={heading}>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{heading}</h3>
            <dl className="space-y-1.5">
              {shortcuts.map(({ keys, description }) => (
                <div key={description} className="flex items-center gap-3 text-sm">
                  <dt className="min-w-0 flex-1">{description}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5">
                    {keys.map((combo, index) => (
                      <Fragment key={combo.join("+")}>
                        {index > 0 && <span className="text-xs text-muted">or</span>}
                        <span className="flex items-center gap-0.5">
                          {combo.map((key) => (
                            <kbd
                              key={key}
                              className="min-w-6 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-center font-sans text-xs font-medium shadow-[inset_0_-1px_0] shadow-border"
                            >
                              {label(key)}
                            </kbd>
                          ))}
                        </span>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
