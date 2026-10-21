"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import Input from "@/components/form/Input";
import type { Sticker } from "@/lib/chat/types";

/** Past this many, the pack gets a search box. */
const SEARCH_FROM = 12;

/** The group's sticker pack; picking one sends it. */
export default function StickerPicker({ stickers, onPick }: { stickers: Sticker[]; onPick: (sticker: Sticker) => void }) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const needle = query.trim().toLowerCase().replace(/\s+/g, "_");
  const shown = needle ? stickers.filter((s) => s.name.includes(needle)) : stickers;

  return (
    <div className="space-y-3">
      {stickers.length >= SEARCH_FROM && (
        <>
          <label htmlFor={searchId} className="sr-only">
            Search stickers
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              id={searchId}
              autoFocus
              autoComplete="off"
              placeholder="Search stickers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
        </>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted">No stickers match “{query.trim()}”.</p>
      ) : (
        <ul className="grid max-h-80 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {shown.map((sticker) => {
            const label = sticker.name.replace(/_/g, " ");
            return (
              <li key={sticker.name}>
                <button
                  type="button"
                  onClick={() => onPick(sticker)}
                  title={label}
                  aria-label={`Send ${label}`}
                  className="flex aspect-square w-full items-center justify-center rounded-lg p-1.5 ring-accent hover:bg-surface-2 hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded stickers */}
                  <img src={sticker.url} alt="" loading="lazy" className="size-full object-contain" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
