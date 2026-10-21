"use client";

import { useState } from "react";
import { CircleAlert, Plus, X } from "lucide-react";
import Checkbox from "@/components/form/Checkbox";
import DateTimeInput from "@/components/form/DateTime";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Radio from "@/components/form/Radio";
import Select from "@/components/form/Select";
import type { PollAttachment, QuizAttachment } from "@/lib/chat/types";

const MAX_OPTIONS = 10;

type OptionsFormProps =
  | { quiz?: false; onSubmit: (attachment: PollAttachment) => void; onCancel: () => void }
  | { quiz: true; onSubmit: (attachment: QuizAttachment) => void; onCancel: () => void };

/** Builds a poll, or a quiz when `quiz` is set (same form plus a correct answer). */
export default function OptionsForm(props: OptionsFormProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correct, setCorrect] = useState<number | null>(null);
  const [multiple, setMultiple] = useState(false);
  /** Multiple-choice polls: at most this many choices; 0 for any number. */
  const [maxChoices, setMaxChoices] = useState(0);
  /** When voting or answering ends (ms); null for never. */
  const [closesAt, setClosesAt] = useState<number | null>(null);
  // The picker's earliest time: when the form opened (submitting checks it's still ahead).
  const [openedAt] = useState(() => Date.now());
  // What's wrong, and which part it's about (shown there).
  const [error, setError] = useState<{ field: "question" | "options" | "closes"; message: string }>();

  /** Show what's wrong where it is, and put the cursor there. */
  function fail(field: "question" | "options" | "closes", message: string, focusId: string) {
    setError({ field, message });
    document.getElementById(focusId)?.focus();
  }

  function submit() {
    const q = question.trim();
    const filled = options.map((o) => o.trim());
    const list = filled.filter(Boolean);
    const firstEmpty = Math.max(0, filled.findIndex((o) => !o));
    if (!q) return fail("question", "Add a question.", "options-question");
    if (list.length < 2) return fail("options", "Add at least two options.", `options-option-${firstEmpty}`);
    if (new Set(list.map((o) => o.toLowerCase())).size !== list.length) {
      return fail("options", "Options must be different from each other.", "options-option-0");
    }
    if (closesAt !== null && closesAt < Date.now() + 60_000) {
      return fail("closes", "Pick a time at least a minute from now.", "options-closes");
    }
    const closes = closesAt !== null ? { closesAt } : {};
    if (props.quiz) {
      const answer = correct === null ? "" : filled[correct];
      if (!answer) return fail("options", "Mark the correct answer.", "options-option-0");
      props.onSubmit({ type: "quiz", question: q, options: list, correctAnswer: answer, ...closes });
    } else {
      // A limit of "all of them" (or more) is no limit.
      const max = multiple && maxChoices >= 2 && maxChoices < list.length ? { maxChoices } : {};
      props.onSubmit({ type: "poll", question: q, options: list, ...(multiple && { multiple: true as const }), ...max, ...closes });
    }
  }

  const rows = options.map((option, index) => (
    <div key={index} className="flex items-center gap-2">
      {props.quiz && (
        <Radio value={String(index)} aria-label={`Option ${index + 1} is correct`} className="shrink-0 items-center" />
      )}
      <Input
        id={`options-option-${index}`}
        value={option}
        maxLength={100}
        onChange={(event) => {
          setOptions((prev) => prev.map((o, i) => (i === index ? event.target.value : o)));
          if (error?.field === "options") setError(undefined);
        }}
        aria-label={`Option ${index + 1}`}
        aria-describedby={error?.field === "options" ? "options-error" : undefined}
        placeholder={`Option ${index + 1}`}
      />
      {options.length > 2 && (
        <button
          type="button"
          onClick={() => {
            setOptions((prev) => prev.filter((_, i) => i !== index));
            setCorrect((prev) => (prev === null || prev === index ? null : prev > index ? prev - 1 : prev));
          }}
          aria-label={`Remove option ${index + 1}`}
          className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  ));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <Field label="Question" htmlFor="options-question" error={error?.field === "question" ? error.message : undefined}>
        <Input
          id="options-question"
          autoFocus
          maxLength={300}
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            if (error?.field === "question") setError(undefined);
          }}
          placeholder={props.quiz ? "What's 2 + 2?" : "Where should we eat?"}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">
          Options{props.quiz && <span className="font-normal text-muted"> · select the correct one</span>}
        </legend>
        {props.quiz ? (
          // A quiz's rows are also its answer choice: one radio group spans them.
          <Radio.Group
            value={correct === null ? "" : String(correct)}
            onChange={(next) => setCorrect(Number(next))}
            aria-label="Correct answer"
            className="gap-2"
          >
            {rows}
          </Radio.Group>
        ) : (
          <div className="space-y-2">{rows}</div>
        )}
        {options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ""])}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-bright hover:underline"
          >
            <Plus aria-hidden className="size-4" />
            Add option
          </button>
        )}
        {error?.field === "options" && (
          <p id="options-error" role="alert" className="flex items-start gap-1.5 text-xs text-danger">
            <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {error.message}
          </p>
        )}
      </fieldset>
      {!props.quiz && (
        <Checkbox checked={multiple} onChange={setMultiple} description="Members can vote for more than one option.">
          Allow more than one answer
        </Checkbox>
      )}
      {!props.quiz && multiple && options.length > 2 && (
        <Field label="How many each" htmlFor="options-max">
          <Select
            id="options-max"
            value={String(maxChoices < options.length ? maxChoices : 0)}
            onChange={(next) => setMaxChoices(Number(next ?? 0))}
            options={[
              { value: "0", label: "Any number" },
              ...Array.from({ length: options.length - 2 }, (_, i) => ({ value: String(i + 2), label: `Up to ${i + 2}` })),
            ]}
          />
        </Field>
      )}
      <Field
        label={props.quiz ? "Stop taking answers" : "Close voting"}
        htmlFor="options-closes"
        optional
        hint={props.quiz ? "The answer is shown to everyone once it closes." : "Leave empty to keep it open."}
        error={error?.field === "closes" ? error.message : undefined}
      >
        <DateTimeInput
          id="options-closes"
          value={closesAt}
          min={openedAt}
          onChange={(next) => {
            setClosesAt(next);
            if (error?.field === "closes") setError(undefined);
          }}
        />
      </Field>
      <FormActions onCancel={props.onCancel} label={props.quiz ? "Add quiz" : "Add poll"} />
    </form>
  );
}

export function FormActions({ onCancel, label }: { onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        {label}
      </button>
    </div>
  );
}
