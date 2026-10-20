import { Download, FileText } from "lucide-react";
import type { FileAttachment } from "@/lib/chat/types";
import { fileName, safeUrl } from "@/lib/chat/url";
import { cn } from "@/lib/utils";
import { card } from "../styles";

export default function File({ attachment }: { attachment: FileAttachment }) {
  const src = safeUrl(attachment.src);
  if (!src) return null;
  const name = fileName(src);
  const extension = name.includes(".") ? name.split(".").pop()!.toUpperCase() : "FILE";

  return (
    <div className={cn(card, "flex items-center gap-3")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
        <FileText aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted">{extension}</p>
      </div>
      <a
        href={src}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Download ${name}`}
        className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Download className="size-4" />
      </a>
    </div>
  );
}
