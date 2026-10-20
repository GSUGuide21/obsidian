"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "lg" for screens with a lot in them (settings). Default "md". */
  size?: "md" | "lg";
};

/** Modal built on the native <dialog>: focus trapping and Escape come for free. */
export default function Dialog({ open, title, onClose, children, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the <dialog> element itself is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/60",
        size === "lg" ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]",
      )}
    >
      <div className="p-5">
        <header className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}
