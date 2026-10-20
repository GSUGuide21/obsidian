"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import type { FileAcceptMode, FileInputProps, FileRejection } from "./types";

export type * from "./types";

/** Each mode as the `accept` attribute wants it: MIME wildcards and extensions. */
const ACCEPT: Record<Exclude<FileAcceptMode, "all">, string[]> = {
  image: ["image/*"],
  video: ["video/*"],
  audio: ["audio/*"],
  media: ["image/*", "video/*", "audio/*"],
  document: [".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".xls", ".xlsx", ".ods", ".csv", ".ppt", ".pptx", ".odp"],
  archive: [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz"],
};

/** The patterns for `accept`; none means anything goes. */
function patterns(accept: FileInputProps["accept"]) {
  const modes = accept === undefined ? [] : Array.isArray(accept) ? accept : [accept];
  if (modes.length === 0 || modes.includes("all")) return [];
  return [...new Set(modes.flatMap((mode) => ACCEPT[mode as Exclude<FileAcceptMode, "all">]))];
}

/** Whether the file matches one of the patterns (dropped files aren't filtered by the browser). */
function accepts(file: File, list: string[]) {
  if (list.length === 0) return true;
  const name = file.name.toLowerCase();
  return list.some((pattern) =>
    pattern.startsWith(".") ? name.endsWith(pattern)
    : pattern.endsWith("/*") ? file.type.startsWith(pattern.slice(0, -1))
    : file.type === pattern,
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

/**
 * A drop zone for files, which also opens the file picker when clicked (or on
 * Enter/Space). The chosen files are listed with their size and a remove
 * button. Controlled with `value`, or uncontrolled with `defaultValue`.
 */
export function FileInput({
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  value,
  defaultValue,
  onChange,
  onReject,
  name,
  required,
  disabled = false,
  children,
  id,
  className,
  ...aria
}: FileInputProps) {
  const [files, setFiles] = useControllable(value, defaultValue ?? [], onChange);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = patterns(accept);

  // Keep the real input's files in step, so they submit with the form.
  useEffect(() => {
    if (inputRef.current) inputRef.current.files = filesOf(files);
  }, [files]);

  function take(incoming: File[]) {
    const rejected: FileRejection[] = [];
    const fits = incoming.filter((file) => {
      if (!accepts(file, list)) rejected.push({ file, reason: "type" });
      else if (maxSize !== undefined && file.size > maxSize) rejected.push({ file, reason: "size" });
      else return true;
      return false;
    });
    let next = multiple ? [...files, ...fits] : fits.slice(-1);
    if (!multiple && fits.length > 1) rejected.push(...fits.slice(0, -1).map((file) => ({ file, reason: "count" as const })));
    if (multiple && maxFiles !== undefined && next.length > maxFiles) {
      rejected.push(...next.slice(maxFiles).map((file) => ({ file, reason: "count" as const })));
      next = next.slice(0, maxFiles);
    }
    if (rejected.length > 0) onReject?.(rejected);
    if (fits.length > 0) setFiles(next);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) take([...event.dataTransfer.files]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors has-focus-visible:border-accent has-focus-visible:ring-2 has-focus-visible:ring-accent/30",
          dragging ? "border-accent bg-accent/10" : "border-border bg-surface-2",
          aria["aria-invalid"] && "border-danger",
          disabled ? "cursor-default opacity-50" : "cursor-pointer hover:border-muted",
        )}
      >
        <input
          {...aria}
          ref={inputRef}
          id={id}
          type="file"
          name={name}
          accept={list.join(",") || undefined}
          multiple={multiple}
          required={required && files.length === 0}
          disabled={disabled}
          onChange={(event) => {
            const picked = [...(event.target.files ?? [])];
            // The picker replaced the input's files: put the list back (the effect updates it
            // again if any were taken; nothing would if all were rejected).
            event.target.files = filesOf(files);
            if (picked.length > 0) take(picked);
          }}
          className="sr-only"
        />
        <Upload aria-hidden className="size-5 text-muted" />
        <span>
          {children ?? (
            <>
              Drop {multiple ? "files" : "a file"} here or <span className="font-medium text-accent-bright">browse</span>
            </>
          )}
        </span>
        {maxSize !== undefined && <span className="text-xs text-muted">Up to {formatBytes(maxSize)}</span>}
      </label>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <FileText aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">{formatBytes(file.size)}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function filesOf(files: File[]) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer.files;
}

export default FileInput;
