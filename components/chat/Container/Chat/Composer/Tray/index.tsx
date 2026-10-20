import {
  CalendarDays,
  ChartBar,
  FileText,
  Film,
  Image as ImageIcon,
  ListChecks,
  Mic,
  Music,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Attachment } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/** An attachment being prepared in the composer (uploading, ready, or failed). */
export type Draft = {
  key: string;
  kind: Attachment["type"];
  label: string;
  /** 0–1 while uploading. */
  progress?: number;
  error?: string;
  /** Object URL for local image previews. */
  preview?: string;
  attachment?: Attachment;
  abort?: () => void;
};

const icons: Partial<Record<Attachment["type"], LucideIcon>> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  voice: Mic,
  file: FileText,
  poll: ChartBar,
  quiz: ListChecks,
  event: CalendarDays,
};

const kindLabels: Partial<Record<Attachment["type"], string>> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  voice: "Voice message",
  file: "File",
  poll: "Poll",
  quiz: "Quiz",
  event: "Event",
};

export default function Tray({ drafts, onRemove }: { drafts: Draft[]; onRemove: (key: string) => void }) {
  return (
    <ul aria-label="Attachments" className="flex gap-2 overflow-x-auto px-2 pt-2">
      {drafts.map((draft) => {
        const Icon = icons[draft.kind] ?? FileText;
        const uploading = !draft.attachment && !draft.error;
        const status = draft.error
          ? draft.error
          : uploading
            ? `Uploading ${Math.round((draft.progress ?? 0) * 100)}%`
            : kindLabels[draft.kind];
        return (
          <li
            key={draft.key}
            className={cn(
              "relative flex w-52 shrink-0 items-center gap-2 overflow-hidden rounded-lg border bg-surface p-2",
              draft.error ? "border-danger" : "border-border",
            )}
          >
            {draft.preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img src={draft.preview} alt="" className="size-10 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent-bright">
                <Icon aria-hidden className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{draft.label}</p>
              <p className={cn("truncate text-[11px]", draft.error ? "text-danger" : "text-muted")}>
                {status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(draft.key)}
              aria-label={`Remove ${draft.label}`}
              className="self-start rounded p-0.5 text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
            {uploading && (
              <span
                aria-hidden
                className="absolute bottom-0 left-0 h-0.5 bg-accent transition-[width]"
                style={{ width: `${(draft.progress ?? 0) * 100}%` }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
