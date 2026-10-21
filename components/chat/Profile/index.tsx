"use client";

import { useRef, useState } from "react";
import { Check, ImageUp, Trash } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import TextArea from "@/components/form/TextArea";
import type { PhotoChoice } from "@/lib/chat/profile";
import { AVATAR_COLORS, INLINE_UPLOAD_TYPES, MAX_BIO_LENGTH, MAX_NAME_LENGTH, type User } from "@/lib/chat/types";
import { uploadFile } from "@/lib/chat/upload";
import { cn } from "@/lib/utils";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** `bio` and `poster` (a cover photo URL) are empty for none. */
export type ProfileDraft = { name: string; color: string; photo: PhotoChoice; bio: string; poster: string };

type ProfileFormProps = {
  /** How everyone currently sees this user. */
  user: User;
  /** Present for signed-in users; `provider` is how they sign in ("Google", "email"…), when known. */
  account?: { email?: string; provider?: string; providerAvatar?: string; photo: PhotoChoice };
  onSave: (draft: ProfileDraft) => Promise<void>;
};

/**
 * Your name, photo, color, bio and cover (a section of the settings screen). It
 * saves in place; given `onClose`, it offers Cancel and closes once saved instead.
 */
export function ProfileForm({
  user,
  account,
  onSave,
  onClose,
}: ProfileFormProps & { onClose?: () => void }) {
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color);
  // Guests have no account photo, so "default" means none for them.
  const [photo, setPhoto] = useState<PhotoChoice>(account?.photo ?? user.avatarUrl ?? "none");
  const [bio, setBio] = useState(user.bio ?? "");
  const [poster, setPoster] = useState(user.posterUrl ?? "");
  const [upload, setUpload] = useState<{ what: "photo" | "cover"; progress: number; abort: () => void } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const cleaned = name.trim().replace(/\s+/g, " ");
  const shownPhoto =
    photo === "none" ? undefined : photo === "default" ? account?.providerAvatar : photo;

  function pickImage(file: File | undefined, what: "photo" | "cover") {
    if (!file) return;
    setError(undefined);
    if (INLINE_UPLOAD_TYPES[file.type] !== "image") return setError("Choose a PNG, JPEG, GIF, WebP or AVIF image.");
    if (file.size > MAX_PHOTO_BYTES) return setError("Photos can be up to 5 MB.");
    const handle = uploadFile(file, (progress) => setUpload((prev) => prev && { ...prev, progress }));
    setUpload({ what, progress: 0, abort: handle.abort });
    handle.promise.then(
      (result) => {
        if (what === "photo") setPhoto(result.url);
        else setPoster(result.url);
        setUpload(null);
      },
      (err: Error) => {
        setUpload(null);
        if (err.name !== "AbortError") setError(err.message);
      },
    );
  }

  async function submit() {
    if (!cleaned) return setError("Your name can't be empty.");
    setSaving(true);
    setError(undefined);
    try {
      await onSave({ name: cleaned, color, photo, bio: bio.trim(), poster });
      if (onClose) return onClose();
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile.");
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-5"
    >
      {/* Cover photos are uploads, so they're for signed-in users only. */}
      {account && (
        <div className="relative h-24 overflow-hidden rounded-xl bg-surface-2">
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded cover photo
            <img src={poster} alt="" className="size-full object-cover" />
          )}
          <div className="absolute right-2 bottom-2 flex gap-1.5">
            <button
              type="button"
              disabled={Boolean(upload)}
              onClick={() => coverRef.current?.click()}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-surface/90 px-2.5 text-xs font-medium shadow-sm hover:bg-surface disabled:opacity-60"
            >
              <ImageUp aria-hidden className="size-3.5" />
              {upload?.what === "cover"
                ? `Uploading ${Math.round(upload.progress * 100)}%`
                : poster
                  ? "Change cover"
                  : "Add cover photo"}
            </button>
            {poster && !upload && (
              <button
                type="button"
                onClick={() => setPoster("")}
                aria-label="Remove cover photo"
                className="inline-flex size-7 items-center justify-center rounded-lg bg-surface/90 text-muted shadow-sm hover:bg-surface hover:text-foreground"
              >
                <Trash className="size-3.5" />
              </button>
            )}
          </div>
          <input
            ref={coverRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
            hidden
            onChange={(event) => {
              pickImage(event.target.files?.[0], "cover");
              event.target.value = "";
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        <Avatar name={cleaned || user.name} color={color} src={shownPhoto} size="lg" className="size-16 text-xl" />
        <div className="flex flex-wrap gap-2">
          {/* Uploads are for signed-in users only. */}
          {account && (
            <button
              type="button"
              disabled={Boolean(upload)}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-60"
            >
              <ImageUp aria-hidden className="size-3.5" />
              {upload?.what === "photo" ? `Uploading ${Math.round(upload.progress * 100)}%` : "Upload photo"}
            </button>
          )}
          {shownPhoto && !upload && (
            <button
              type="button"
              onClick={() => setPhoto("none")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <Trash aria-hidden className="size-3.5" />
              Remove
            </button>
          )}
          {account?.providerAvatar && photo !== "default" && !upload && (
            <button
              type="button"
              onClick={() => setPhoto("default")}
              className="h-8 rounded-lg px-3 text-xs font-medium text-accent-bright hover:bg-surface-2"
            >
              Use {account.provider ?? "account"} photo
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          hidden
          onChange={(event) => {
            pickImage(event.target.files?.[0], "photo");
            event.target.value = "";
          }}
        />
      </div>

      <Field
        label="Display name"
        htmlFor="profile-name"
        hint={
          account?.email
            ? `Signed in${account.provider && account.provider !== "email" ? ` with ${account.provider}` : ""} as ${account.email}`
            : "You're a guest. Sign in to keep your profile."
        }
      >
        <Input
          id="profile-name"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Bio" htmlFor="profile-bio" optional hint={`Up to ${MAX_BIO_LENGTH} characters.`}>
        <TextArea
          id="profile-bio"
          rows={3}
          maxLength={MAX_BIO_LENGTH}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="A little about you"
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Avatar color</legend>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((swatch, index) => (
            <label key={swatch} className="relative cursor-pointer">
              <input
                type="radio"
                name="avatar-color"
                value={swatch}
                checked={color === swatch}
                onChange={() => setColor(swatch)}
                aria-label={`Color ${index + 1}`}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                  color === swatch && "ring-2 ring-foreground",
                )}
                style={{ backgroundColor: swatch }}
              >
                {color === swatch && <Check aria-hidden className="size-4 text-white" />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className={cn("flex items-center justify-end gap-2 pt-1", !onClose && "border-t border-border pt-4")}>
        <SavedNote show={saved} />
        {onClose && (
          <button
            type="button"
            onClick={() => {
              upload?.abort();
              onClose();
            }}
            className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving || Boolean(upload) || !cleaned}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
        >
          {saving ? "Saving…" : onClose ? "Save" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

/** "Saved", for a moment after a form on the settings screen saves. */
function SavedNote({ show }: { show: boolean }) {
  return show ? (
    <p role="status" className="mr-auto flex items-center gap-1.5 text-sm text-muted">
      <Check aria-hidden className="size-4 text-online" />
      Saved
    </p>
  ) : null;
}
