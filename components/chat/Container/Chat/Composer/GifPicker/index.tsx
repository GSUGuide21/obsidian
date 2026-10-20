"use client";

import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import Input from "@/components/form/Input";
import { useDebounce } from "@/lib/hooks/useDebounce";
import type { GifResult } from "@/lib/chat/types";

/** Search GIFs (trending before you type) and pick one to send. */
export default function GifPicker({
  initialQuery = "",
  onPick,
}: {
  initialQuery?: string;
  onPick: (gif: GifResult) => void;
}) {
  const { searchGifs } = useChatContext();
  const [query, setQuery] = useState(initialQuery);
  const debounced = useDebounce(query.trim(), 350);
  /** `undefined` while loading; `null` when GIFs aren't available. */
  const [results, setResults] = useState<GifResult[] | null>();
  const searchId = useId();

  useEffect(() => {
    let active = true;
    void searchGifs(debounced).then((found) => {
      if (active) setResults(found === undefined ? [] : found);
    });
    return () => {
      active = false;
    };
  }, [debounced, searchGifs]);

  return (
    <div className="space-y-3">
      <label htmlFor={searchId} className="sr-only">
        Search GIFs
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input
          id={searchId}
          autoFocus
          autoComplete="off"
          placeholder="Search GIFs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>
      {results === null ? (
        <p className="text-sm text-muted">GIFs aren&apos;t set up on this server.</p>
      ) : results === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted">No GIFs found.</p>
      ) : (
        <ul className="grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
          {results.map((gif) => (
            <li key={gif.id}>
              <button
                type="button"
                onClick={() => onPick(gif)}
                title={gif.title}
                className="block w-full overflow-hidden rounded-lg bg-surface-2 ring-accent hover:ring-2 focus-visible:ring-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- remote GIF previews */}
                <img src={gif.preview} alt={gif.title} loading="lazy" className="h-28 w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-right text-[11px] text-muted">Powered by Tenor</p>
    </div>
  );
}
