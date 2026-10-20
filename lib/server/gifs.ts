// GIF search through Tenor, so the API key stays on the server.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import "./env.ts";
import type { GifResult } from "../chat/types";
import { limiter } from "./limits.ts";

// ---------------------------------------------------------------------------
// GIF search through Tenor, so the API key stays on the server. Off without
// TENOR_API_KEY.
// ---------------------------------------------------------------------------

export const tenorKey = process.env.TENOR_API_KEY;

export const canSearchGifs = limiter(20, 1);

export async function searchGifs(query: string): Promise<GifResult[]> {
  const params = new URLSearchParams({
    key: tenorKey!,
    client_key: "obsidian-chat",
    limit: "24",
    media_filter: "gif,tinygif",
    contentfilter: "medium",
  });
  if (query) params.set("q", query);
  const response = await fetch(`https://tenor.googleapis.com/v2/${query ? "search" : "featured"}?${params}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Tenor answered ${response.status}`);
  type Format = { url?: string; dims?: number[] };
  const data = (await response.json()) as {
    results?: { id: string; content_description?: string; media_formats?: Record<string, Format> }[];
  };
  return (data.results ?? []).flatMap((result) => {
    const gif = result.media_formats?.gif;
    const tiny = result.media_formats?.tinygif ?? gif;
    if (!gif?.url?.startsWith("https://") || !tiny?.url?.startsWith("https://")) return [];
    return [{
      id: result.id,
      url: gif.url,
      preview: tiny.url,
      width: gif.dims?.[0] ?? 0,
      height: gif.dims?.[1] ?? 0,
      title: (result.content_description || "GIF").slice(0, 200),
    }];
  });
}
