"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import { useFieldAria } from "../Field/context";
import { inputVariants } from "../Input/variants";
import { Listbox, optionId, toSelected, useActiveOption } from "../Listbox";
import { Tag } from "../Tags";
import { SelectContent } from "./Content";
import { SelectTrigger } from "./Trigger";
import type { AutocompleteSelectProps, MultipleSelectProps, SelectOption, SelectProps, SingleSelectProps } from "./types";

export { SelectContent, SelectTrigger };
export type * from "./types";

/**
 * Pick from `options`: from a dropdown (the default), by typing ("combobox"),
 * with suggestions for free text ("autocomplete"), from a list shown in place
 * ("list"), or several as chips ("tags", with `multiple`). Controlled with
 * `value`, or uncontrolled with `defaultValue`.
 */
export function Select(props: SelectProps) {
  // The list takes what applies to it and ignores the rest.
  if (props.type === "list") return <Listbox {...props} />;
  if (props.multiple && props.type === "tags") return <TagsSelect {...props} />;
  if (!props.multiple && (props.type === "combobox" || props.type === "autocomplete")) return <ComboboxSelect {...props} />;
  return <DropdownSelect {...(props as SingleSelectProps | MultipleSelectProps)} />;
}

export default Select;

/** The chosen options' values, in the options' order, after toggling `value`. */
function toggled(options: SelectOption[], selected: ReadonlySet<string>, value: string) {
  return selected.has(value)
    ? options.filter((o) => o.value !== value && selected.has(o.value)).map((o) => o.value)
    : options.filter((o) => o.value === value || selected.has(o.value)).map((o) => o.value);
}

/** Where the active option starts when the list opens: the chosen one, else the first. */
function startIndex(options: SelectOption[], selected: ReadonlySet<string>) {
  const chosen = options.findIndex((o) => selected.has(o.value) && !o.disabled);
  return chosen >= 0 ? chosen : options.findIndex((o) => !o.disabled);
}

function DropdownSelect(props: SingleSelectProps | MultipleSelectProps) {
  const { options, placeholder, name, disabled = false, required, emptyText, id, className } = props;
  const [value, setValue] = useControllable<string | string[] | null>(
    props.value,
    props.defaultValue ?? (props.multiple ? [] : null),
  );
  const selected = toSelected(value);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { active, setActive, navigate } = useActiveOption(options, { typeahead: true });

  function show() {
    setActive(startIndex(options, selected));
    setOpen(true);
  }

  function pick(option: SelectOption) {
    if (props.multiple) {
      const next = toggled(options, selected, option.value);
      setValue(next);
      props.onChange?.(next);
    } else {
      setValue(option.value);
      props.onChange?.(option.value);
      setOpen(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      } else if (event.key.length === 1 && navigate(event)) {
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (!navigate(event) && (event.key === "Enter" || event.key === " ") && active >= 0) {
      event.preventDefault();
      pick(options[active]);
    }
  }

  const labels = options.filter((o) => selected.has(o.value)).map((o) => o.label);
  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <SelectTrigger
        id={id}
        open={open}
        disabled={disabled}
        placeholder={placeholder}
        display={props.multiple && labels.length > 2 ? `${labels.length} selected` : labels.join(", ")}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
        aria-required={required || undefined}
        aria-invalid={props["aria-invalid"]}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        // Keyboard clicks (detail 0) are handled in onKeyDown.
        onClick={(event) => {
          if (event.detail === 0) return;
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <SelectContent
          anchorRef={rootRef}
          listId={listId}
          multiple={props.multiple}
          options={options}
          active={active}
          selected={selected}
          onPick={pick}
          onHover={setActive}
          emptyText={emptyText}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
        />
      )}
      {name && [...selected].map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </div>
  );
}

/** Options whose label contains what's typed (all of them while nothing is). */
function matching(options: SelectOption[], text: string) {
  const needle = text.trim().toLowerCase();
  return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
}

function ComboboxSelect(props: SingleSelectProps | AutocompleteSelectProps) {
  const { options, placeholder, name, disabled = false, required, maxLength, emptyText, id, className } = props;
  const aria = useFieldAria(props);
  const free = props.type === "autocomplete";
  // A combobox's value is an option's value; an autocomplete's is the text itself.
  const [value, setValue] = useControllable<string | null>(
    props.value,
    props.defaultValue ?? (free ? "" : null),
    props.onChange as ((value: string | null) => void) | undefined,
  );
  const chosen = free ? undefined : options.find((o) => o.value === value);
  // What's been typed since the box was focused; until then it shows the chosen label.
  const [query, setQuery] = useState<string | null>(null);
  const text = free ? (value ?? "") : (query ?? chosen?.label ?? "");
  const shown = matching(options, free ? text : (query ?? ""));
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { active, setActive, navigate } = useActiveOption(shown);

  function pick(option: SelectOption) {
    if (free) {
      setValue(option.label);
    } else {
      setValue(option.value);
      setQuery(null);
    }
    setOpen(false);
  }

  /** Leaving the box: a combobox goes back to showing its choice (or none, if it was cleared). */
  function settle() {
    setOpen(false);
    if (free || query === null) return;
    if (!query.trim() && value !== null) setValue(null);
    setQuery(null);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
        aria-required={required || undefined}
        aria-invalid={aria["aria-invalid"]}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={aria["aria-describedby"]}
        name={free ? name : undefined}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          if (free) setValue(event.target.value);
          else setQuery(event.target.value);
          setOpen(true);
          // A combobox highlights the best match, so Enter takes it; free text keeps what's typed.
          setActive(free ? -1 : 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!open) {
              event.preventDefault();
              setOpen(true);
              setActive(startIndex(shown, toSelected(chosen?.value)));
            } else {
              navigate(event);
            }
          } else if (event.key === "Enter" && open && active >= 0 && shown[active]) {
            event.preventDefault();
            pick(shown[active]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onClick={() => setOpen(true)}
        onBlur={settle}
        className={cn(inputVariants(), "pr-9 pointer-coarse:h-11 pointer-coarse:text-base")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          inputRef.current?.focus();
          setOpen((was) => !was);
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted disabled:opacity-50"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {/* Free text needs no "no matches": what's typed is the value. */}
      {open && (shown.length > 0 || !free) && (
        <SelectContent
          anchorRef={rootRef}
          listId={listId}
          options={shown}
          active={active}
          selected={toSelected(chosen?.value)}
          onPick={pick}
          onHover={setActive}
          emptyText={emptyText ?? "No matches."}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
        />
      )}
      {!free && name && value !== null && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

function TagsSelect(props: MultipleSelectProps) {
  const { options, placeholder, name, disabled = false, required, maxLength, emptyText, id, className } = props;
  const aria = useFieldAria(props);
  const [value, setValue] = useControllable(props.value, props.defaultValue ?? [], props.onChange);
  const selected = toSelected(value);
  const [query, setQuery] = useState("");
  const shown = matching(options, query);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { active, setActive, navigate } = useActiveOption(shown);
  const chips = options.filter((o) => selected.has(o.value));

  function pick(option: SelectOption) {
    setValue(toggled(options, selected, option.value));
    setQuery("");
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(inputVariants({ size: "auto", frame: true }), "flex min-h-10 cursor-text flex-wrap items-center gap-1.5 px-2 py-1.5")}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            event.currentTarget.querySelector("input")?.focus();
            setOpen(true);
          }
        }}
      >
        {chips.map((option) => (
          <Tag
            key={option.value}
            label={option.label}
            onRemove={disabled ? undefined : () => setValue(toggled(options, selected, option.value))}
          >
            {option.label}
          </Tag>
        ))}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
          aria-required={required || undefined}
          aria-invalid={aria["aria-invalid"]}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={aria["aria-describedby"]}
          disabled={disabled}
          placeholder={chips.length === 0 ? placeholder : undefined}
          maxLength={maxLength}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (!open) {
                event.preventDefault();
                setOpen(true);
                setActive(startIndex(shown, new Set()));
              } else {
                navigate(event);
              }
            } else if (event.key === "Enter" && open && active >= 0 && shown[active]) {
              event.preventDefault();
              pick(shown[active]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === "Backspace" && !query && chips.length > 0) {
              event.preventDefault();
              setValue(toggled(options, selected, chips[chips.length - 1].value));
            }
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery("");
          }}
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted pointer-coarse:text-base"
        />
      </div>
      {open && (
        <SelectContent
          anchorRef={rootRef}
          listId={listId}
          multiple
          options={shown}
          active={active}
          selected={selected}
          onPick={pick}
          onHover={setActive}
          emptyText={emptyText ?? "No matches."}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
        />
      )}
      {name && [...selected].map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </div>
  );
}
