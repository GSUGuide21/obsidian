"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { useAnchoredPosition, type Anchoring } from "@/lib/hooks/useAnchoredPosition";
import { cn } from "@/lib/utils";

export type MenuItem =
  | {
      kind?: "item";
      label: string;
      icon?: ReactNode;
      /** A quieter second line. */
      description?: string;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** A choice among several (e.g. your presence): shown with a check, read out as checked or not. */
      checked?: boolean;
      /** Ask first: the first click shows this (e.g. "Click again to remove"); the second does it. */
      confirm?: string;
    }
  | { kind: "separator" }
  | { kind: "label"; label: string };

/** What the menu's button needs: spread them onto it. */
export type MenuTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls"?: string;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

type MenuProps = Anchoring & {
  /** The menu's accessible name, e.g. "Your account". */
  label: string;
  items: MenuItem[];
  /** Renders the button that opens it. */
  trigger: (props: MenuTriggerProps) => ReactNode;
  /** Shown above the items, not focusable (e.g. who the menu is about). */
  header?: ReactNode;
  className?: string;
};

/**
 * A button that opens a list of actions. Arrows, Home and End move between
 * them (typing a letter jumps to the next one starting with it), Enter or
 * Space picks, and Escape closes it, back on the button.
 */
export function Menu({ label, items, trigger, header, className, maxHeight = 560, ...anchoring }: MenuProps) {
  const [open, setOpen] = useState<false | "first" | "last">(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    "aria-haspopup": "menu",
    "aria-expanded": Boolean(open),
    "aria-controls": open ? menuId : undefined,
    onClick: () => setOpen((was) => (was ? false : "first")),
    onKeyDown: (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(event.key === "ArrowDown" ? "first" : "last");
      }
    },
  };

  return (
    <>
      {trigger(triggerProps)}
      {open && (
        <MenuPopup
          id={menuId}
          label={label}
          items={items}
          header={header}
          focus={open}
          anchorRef={triggerRef}
          menuRef={menuRef}
          // Menus are short lists of actions: room for all of them (it scrolls past that).
          anchoring={{ ...anchoring, maxHeight }}
          className={className}
          onClose={close}
        />
      )}
    </>
  );
}

function MenuPopup({
  id,
  label,
  items,
  header,
  focus,
  anchorRef,
  menuRef,
  anchoring,
  className,
  onClose,
}: {
  id: string;
  label: string;
  items: MenuItem[];
  header?: ReactNode;
  focus: "first" | "last";
  anchorRef: RefObject<HTMLButtonElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  anchoring: Anchoring;
  className?: string;
  onClose: (refocus: boolean) => void;
}) {
  const position = useAnchoredPosition(anchorRef, anchoring);
  // The item waiting for its confirming second click.
  const [armed, setArmed] = useState<number | null>(null);
  const enabled = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];

  // Focus the first (or last) item once it's placed (only then: it moves as you scroll).
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!position || focusedRef.current) return;
    focusedRef.current = true;
    const list = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    (focus === "last" ? list.at(-1) : list[0])?.focus();
  }, [position, focus, menuRef]);

  // A press anywhere else closes it (without taking focus back: you clicked somewhere).
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuRef, anchorRef, onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (event.key === "ArrowDown") next = list[(at + 1) % list.length];
    else if (event.key === "ArrowUp") next = list[(at - 1 + list.length) % list.length];
    else if (event.key === "Home") next = list[0];
    else if (event.key === "End") next = list.at(-1);
    else if (event.key === "Escape") {
      event.preventDefault();
      return onClose(true);
    } else if (event.key === "Tab") {
      return onClose(false);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const key = event.key.toLowerCase();
      const order = [...list.slice(at + 1), ...list.slice(0, at + 1)];
      next = order.find((el) => el.textContent?.trim().toLowerCase().startsWith(key));
    }
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  if (!position) return null;
  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={position.style}
      className={cn(
        "z-50 min-w-52 overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm text-foreground shadow-2xl",
        className,
      )}
    >
      {header && <div className="px-2 pt-1.5 pb-2">{header}</div>}
      {items.map((item, index) => {
        if (item.kind === "separator") return <div key={index} role="separator" className="my-1 h-px bg-border" />;
        if (item.kind === "label") {
          return (
            <div key={index} role="presentation" className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted uppercase">
              {item.label}
            </div>
          );
        }
        const checkable = item.checked !== undefined;
        const asking = armed === index;
        return (
          <button
            key={index}
            type="button"
            role={checkable ? "menuitemradio" : "menuitem"}
            aria-checked={checkable ? item.checked : undefined}
            tabIndex={-1}
            disabled={item.disabled}
            onBlur={() => {
              if (asking) setArmed(null);
            }}
            onClick={() => {
              if (item.confirm && !asking) return setArmed(index);
              // Focus goes back to the button first, so whatever the item opens (a dialog) can take it from there.
              onClose(true);
              item.onSelect();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus:bg-surface-2 disabled:opacity-40 pointer-coarse:py-2.5",
              item.danger ? "text-danger" : "text-foreground",
              asking && "bg-danger/15 font-medium text-danger focus:bg-danger/20",
            )}
          >
            {checkable ? (
              <Check aria-hidden className={cn("size-4 shrink-0", item.checked ? "text-accent-bright" : "invisible")} />
            ) : (
              item.icon && <span className={cn("flex size-4 shrink-0 items-center justify-center", !item.danger && "text-muted")}>{item.icon}</span>
            )}
            <span className="min-w-0 flex-1">
              {/* Read out when it changes, so a screen reader hears the question. */}
              <span className="block truncate" aria-live={item.confirm ? "polite" : undefined}>
                {asking ? item.confirm : item.label}
              </span>
              {item.description && <span className="block truncate text-xs text-muted">{item.description}</span>}
            </span>
          </button>
        );
      })}
    </div>,
    position.container,
  );
}

export default Menu;
