"use client";

import { useState } from "react";
import { CircleAlert, Plus, X } from "lucide-react";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Radio from "@/components/form/Radio";
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
  // What's wrong, and which part it's about (shown there).
  const [error, setError] = useState<{ field: "question" | "options"; message: string }>();

  /** Show what's wrong where it is, and put the cursor there. */
  function fail(field: "question" | "options", message: string, focusId: string) {
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
    if (props.quiz) {
      const answer = correct === null ? "" : filled[correct];
      if (!answer) return fail("options", "Mark the correct answer.", "options-option-0");
      props.onSubmit({ type: "quiz", question: q, options: list, correctAnswer: answer });
    } else {
      props.onSubmit({ type: "poll", question: q, options: list });
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
