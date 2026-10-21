import { randomUUID } from "node:crypto";
import { baseType, cleanFileName } from "@/lib/chat/storage";
import { MAX_UPLOAD_BYTES, type UploadResult } from "@/lib/chat/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "uploads";
const PER_MINUTE = 20;
const recent = new Map<string, number[]>();

/** At most PER_MINUTE uploads per user per rolling minute (per server process). */
function allow(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= PER_MINUTE) return false;
  times.push(now);
  recent.set(userId, times);
  return true;
}

export async function POST(request: Request) {
  // Signed-in users only: the session cookie is verified, not trusted.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) {
    return Response.json({ error: "Sign in to attach files." }, { status: 401 });
  }
  if (!allow(userId)) {
    return Response.json({ error: "Too many uploads. Wait a minute and try again." }, { status: 429 });
  }

  // Reject oversized bodies before buffering them (allow for multipart overhead).
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "File is too large (max 25 MB)." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "File is too large (max 25 MB)." }, { status: 413 });
  }

  const name = cleanFileName(file.name);
  const type = baseType(file.type);
  // Storage keys allow a limited character set; the readable name is kept
  // in the uploads table and as the last path segment.
  const safeName = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "file";
  const objectPath = `${userId}/${randomUUID()}/${safeName}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectPath, file, {
    contentType: type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) {
    console.error("storage upload failed:", uploadError.message);
    return Response.json({ error: "Upload failed. Try again." }, { status: 502 });
  }

  const { error: recordError } = await admin.from("uploads").insert({
    owner_id: userId,
    object_path: objectPath,
    name,
    content_type: type,
    size: file.size,
  });
  // The file is stored either way; the record only tracks ownership.
  if (recordError) console.error("upload record failed:", recordError.message);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  const result: UploadResult = { url: data.publicUrl, name: safeName, size: file.size, type };
  return Response.json(result, { status: 201 });
}
