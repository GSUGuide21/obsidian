"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import type { ListboxOption, ListboxProps } from "./types";

export type * from "./types";

/** The id of the option at `index` in the list `listId`. */
export const optionId = (listId: string, index: number) => `${listId}-option-${index}`;

/**
 * Which option is highlighted ("active") in a list, and the keys that move it:
 * arrows, Home and End, skipping disabled options. With `typeahead`, typing
 * letters jumps to the next option starting with them (lists that don't have
 * a text box of their own).
 */
export function useActiveOption(options: ListboxOption[], { typeahead = false } = {}) {
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: "", at: 0 });
  // Options can shrink (filtering): never point past the end.
  const current = active < options.length ? active : -1;
  const enabled = (index: number) => Boolean(options[index] && !options[index].disabled);
  const first = () => options.findIndex((o) => !o.disabled);
  const last = () => options.findLastIndex((o) => !o.disabled);

  function step(from: number, delta: 1 | -1) {
    for (let next = from + delta; next >= 0 && next < options.length; next += delta) {
      if (enabled(next)) return next;
    }
    return from;
  }

  function search(char: string) {
    const now = Date.now();
    // Letters typed within a second of each other build up a prefix.
    const text = now - typed.current.at < 1000 ? typed.current.text + char : char;
    typed.current = { text, at: now };
    const needle = text.toLowerCase();
    // Repeating one letter cycles through the options starting with it; a
    // longer prefix may still match the current option.
    const repeated = [...needle].every((c) => c === needle[0]);
    const prefix = repeated ? needle[0] : needle;
    const from = repeated ? current + 1 : Math.max(current, 0);
    const order = [...options.keys()].map((i) => (from + i) % options.length);
    return order.find((i) => enabled(i) && options[i].label.toLowerCase().startsWith(prefix)) ?? -1;
  }

  /** Move for a navigation key; returns whether the key was one. */
  function navigate(event: KeyboardEvent) {
    let next: number | null = null;
    if (event.key === "ArrowDown") next = current < 0 ? first() : step(current, 1);
    else if (event.key === "ArrowUp") next = current < 0 ? last() : step(current, -1);
    else if (event.key === "Home") next = first();
    else if (event.key === "End") next = last();
    else if (typeahead && event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const found = search(event.key);
      if (found >= 0) next = found;
      else return true;
    }
    if (next === null) return false;
    event.preventDefault();
    setActive(next);
    return true;
  }

  return { active: current, setActive, navigate, first };
}

export type ListboxItemsProps = {
  /** The list's id: options get ids from it, for aria-activedescendant. */
  listId: string;
  options: ListboxOption[];
  active: number;
  selected: ReadonlySet<string>;
  onPick: (option: ListboxOption) => void;
  onHover: (index: number) => void;
  emptyText?: ReactNode;
};

/**
 * The options of a role="listbox" element. Focus stays where it is (the list,
 * or a select's trigger or text box): the active option is pointed to with
 * aria-activedescendant, and kept scrolled into view.
 */
export function ListboxItems({ listId, options, active, selected, onPick, onHover, emptyText }: ListboxItemsProps) {
  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(listId, active))?.scrollIntoView({ block: "nearest" });
  }, [listId, active]);

  if (options.length === 0) {
    return <li className="px-2 py-1.5 text-sm text-muted">{emptyText ?? "Nothing to choose from."}</li>;
  }
  return options.map((option, index) => {
    const isSelected = selected.has(option.value);
    return (
      <li
        key={option.value}
        id={optionId(listId, index)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        // Keep focus where it is.
        onPointerDown={(event) => event.preventDefault()}
        onPointerMove={() => {
          if (!option.disabled && index !== active) onHover(index);
        }}
        onClick={() => {
          if (!option.disabled) onPick(option);
        }}
        className={cn(
          "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm pointer-coarse:py-2.5",
          option.disabled ? "cursor-default opacity-50" : "cursor-pointer",
          index === active && "bg-surface-2",
        )}
      >
        <Check aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", isSelected ? "text-accent-bright" : "invisible")} />
        {option.icon && <span className="mt-0.5 shrink-0">{option.icon}</span>}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{option.label}</span>
          {option.description && <span className="text-xs text-muted">{option.description}</span>}
        </span>
      </li>
    );
  });
}

/** Turn a single or multiple value into the set of chosen values. */
export function toSelected(value: string | string[] | null | undefined): ReadonlySet<string> {
  return new Set(value == null ? [] : typeof value === "string" ? [value] : value);
}

/**
 * A list to pick one option from (or several, with `multiple`), shown in
 * place. Controlled with `value`, or uncontrolled with `defaultValue`. Tab in,
 * then arrows, Home/End or typing move, and Enter or Space picks.
 */
export function Listbox(props: ListboxProps) {
  const {
    options,
    name,
    disabled = false,
    emptyText,
    id,
    className,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    "aria-invalid": ariaInvalid,
  } = props;
  const [value, setValue] = useControllable<string | string[] | null>(
    props.value,
    props.defaultValue ?? (props.multiple ? [] : null),
  );
  const selected = toSelected(value);
  const autoId = useId();
  const listId = id ?? autoId;
  const { active, setActive, navigate } = useActiveOption(options, { typeahead: true });

  function pick(option: ListboxOption) {
    if (props.multiple) {
      const next = selected.has(option.value)
        ? [...selected].filter((v) => v !== option.value)
        : options.filter((o) => o.value === option.value || selected.has(o.value)).map((o) => o.value);
      setValue(next);
      props.onChange?.(next);
    } else {
      setValue(option.value);
      props.onChange?.(option.value);
    }
  }

  return (
    <>
      <ul
        id={listId}
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-multiselectable={props.multiple || undefined}
        aria-activedescendant={active >= 0 ? optionId(listId, active) : undefined}
        aria-disabled={disabled || undefined}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        onFocus={() => {
          // Start from the chosen option (or the first).
          if (active < 0) {
            const chosen = options.findIndex((o) => selected.has(o.value));
            setActive(chosen >= 0 ? chosen : options.findIndex((o) => !o.disabled));
          }
        }}
        onKeyDown={(event) => {
          if (disabled || navigate(event)) return;
          if ((event.key === "Enter" || event.key === " ") && active >= 0) {
            event.preventDefault();
            pick(options[active]);
          }
        }}
        className={cn(
          "max-h-60 overflow-y-auto rounded-lg border border-border bg-surface-2 p-1 outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 aria-invalid:border-danger",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
      >
        <ListboxItems
          listId={listId}
          options={options}
          active={active}
          selected={selected}
          onPick={pick}
          onHover={setActive}
          emptyText={emptyText}
        />
      </ul>
      {name && [...selected].map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </>
  );
}

export default Listbox;
