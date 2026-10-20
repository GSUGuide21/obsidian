import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { metaPath, UPLOAD_ID, uploadPath, type StoredUpload } from "@/lib/chat/storage";
import { INLINE_UPLOAD_TYPES } from "@/lib/chat/types";

export async function GET(request: Request, ctx: RouteContext<"/api/uploads/[id]/[name]">) {
  const { id } = await ctx.params;
  if (!UPLOAD_ID.test(id)) return new Response("Not found", { status: 404 });

  let meta: StoredUpload;
  try {
    meta = JSON.parse(await readFile(metaPath(id), "utf8"));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  // Only known-safe media render inline; everything else downloads.
  const inline = meta.type in INLINE_UPLOAD_TYPES;
  const headers = new Headers({
    "Content-Type": inline ? meta.type : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    "X-Content-Type-Options": "nosniff",
    // SVGs can carry <script>. They're safe inside <img>, but opening the URL
    // directly would run it on this origin; the sandbox blocks that.
    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  });

  // Range support lets audio/video seek without downloading everything.
  let start = 0;
  let end = meta.size - 1;
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  const partial = Boolean(range && (range[1] || range[2]));
  if (range && partial) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else {
      start = Math.max(0, meta.size - Number(range[2]));
    }
    if (start > end || start >= meta.size) {
      headers.set("Content-Range", `bytes */${meta.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${meta.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));

  const stream = Readable.toWeb(createReadStream(uploadPath(id), { start, end }));
  return new Response(stream as unknown as ReadableStream, { status: partial ? 206 : 200, headers });
}
