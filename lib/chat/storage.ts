// Server-only: imported by the /api/uploads route handler and the chat server
// (by path, under Node's type stripping: no imports here). Files go to the
// "uploads" Supabase Storage bucket; these clean up what the browser sends.

/**
 * The object path of a file in the "uploads" bucket, from its public URL
 * (as the /api/uploads route hands it out); undefined for any other URL.
 */
export function uploadObjectPath(url: string, supabaseUrl: string) {
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/uploads/`;
  if (!url.startsWith(prefix)) return undefined;
  const rest = url.slice(prefix.length).split(/[?#]/)[0];
  try {
    const path = decodeURIComponent(rest);
    // Paths are "<owner>/<uuid>/<name>" (see the route); nothing that could climb out of the bucket.
    return path && !path.split("/").some((part) => part === ".." || part === ".") ? path : undefined;
  } catch {
    return undefined;
  }
}

/** Strip path parts and control characters, keep it short. */
export function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(-120);
  return cleaned || "file";
}

/** "audio/webm;codecs=opus" -> "audio/webm" */
export function baseType(type: string) {
  return type.split(";")[0].trim().toLowerCase() || "application/octet-stream";
}
