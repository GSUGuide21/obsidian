"use client";

import { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { UserStatus } from "@/lib/chat/types";
import { cn, readableOn } from "@/lib/utils";

const avatar = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center font-semibold",
  {
    variants: {
      size: {
        xs: "size-4 text-[8px]",
        sm: "size-8 text-xs",
        md: "size-9 text-sm",
        lg: "size-11 text-base",
      },
      shape: {
        circle: "rounded-full",
        square: "rounded-xl",
      },
    },
    defaultVariants: { size: "md", shape: "circle" },
  },
);

type AvatarProps = VariantProps<typeof avatar> & {
  name: string;
  color: string;
  /** Profile picture; falls back to initials if missing or broken. */
  src?: string;
  status?: UserStatus;
  className?: string;
};

const STATUS_DOT: Record<UserStatus, string> = {
  online: "bg-online",
  away: "bg-warning",
  dnd: "bg-danger-strong",
  offline: "bg-muted",
};

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

// Decorative: the name is always rendered as text next to the avatar.
export default function Avatar({ name, color, src, size, shape, status, className }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = src && failedSrc !== src;

  return (
    // Initials stay readable on light colors (groups can have any color).
    <span aria-hidden className={cn(avatar({ size, shape }), className)} style={{ backgroundColor: color, color: readableOn(color) }}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote profile pictures
        <img
          src={src}
          alt=""
          // Google's avatar CDN rejects some requests that carry a Referer.
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className={cn("size-full object-cover", shape === "square" ? "rounded-xl" : "rounded-full")}
        />
      ) : (
        initials(name)
      )}
      {status && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 flex size-3 items-center justify-center rounded-full ring-2 ring-surface",
            STATUS_DOT[status],
          )}
        >
          {/* Do not disturb: a bar, so it doesn't rely on color alone. */}
          {status === "dnd" && <span className="h-0.5 w-1.5 rounded-full bg-white" />}
        </span>
      )}
    </span>
  );
}
