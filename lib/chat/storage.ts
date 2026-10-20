// Server-only: imported by the /api/uploads route handler. Files go to the
// "uploads" Supabase Storage bucket; these clean up what the browser sends.

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
