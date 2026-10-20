import { INLINE_UPLOAD_TYPES, MAX_UPLOAD_BYTES, type Attachment, type UploadResult } from "./types";

export type UploadHandle = {
  promise: Promise<UploadResult>;
  abort: () => void;
};

/** POST a file to /api/uploads, reporting progress (0–1). Uses XHR because fetch has no upload progress. */
export function uploadFile(file: File, onProgress: (fraction: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadResult>((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error("File is too large (max 25 MB)."));
      return;
    }
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Fall through to the generic error.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body as UploadResult);
      else reject(new Error((body as { error?: string } | null)?.error ?? "Upload failed."));
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed. Check your connection.")));
    xhr.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));

    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", "/api/uploads");
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

async function imageSize(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

/** Turn a finished upload into the matching attachment type. */
export async function attachmentFor(file: File, upload: UploadResult, voice = false): Promise<Attachment> {
  if (voice) return { type: "voice", src: upload.url };
  const kind = INLINE_UPLOAD_TYPES[upload.type];
  if (kind === "image") return { type: "image", src: upload.url, ...(await imageSize(file)) };
  if (kind === "video") return { type: "video", src: upload.url };
  if (kind === "audio") return { type: "audio", src: upload.url, caption: upload.name };
  return { type: "file", src: upload.url };
}
