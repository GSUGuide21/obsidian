"use client";

import { useId, useRef, useState } from "react";
import { ImageUp, Trash } from "lucide-react";
import Dialog from "@/components/Dialog";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import TextArea from "@/components/form/TextArea";
import { INLINE_UPLOAD_TYPES, MAX_BIO_LENGTH, MAX_NAME_LENGTH, type MemberProfile, type User } from "@/lib/chat/types";
import { uploadFile } from "@/lib/chat/upload";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type GroupProfileDialogProps = {
  open: boolean;
  groupName: string;
  /** You, as everyone sees you outside this group (the fallback for empty fields). */
  self: User;
  /** Uploads are for signed-in users only. */
  canUpload: boolean;
  /** Your current group profile, if you have one. */
  profile?: MemberProfile;
  /** `null` goes back to your app-wide profile. Resolves to an error message, or undefined on success. */
  onSave: (profile: MemberProfile | null) => Promise<string | undefined>;
  onClose: () => void;
};

/** Your display name, photo and bio inside one group, in place of your app-wide ones. */
export default function GroupProfileDialog({ open, groupName, onClose, ...props }: GroupProfileDialogProps) {
  return (
    <Dialog open={open} title={`Your profile in ${groupName}`} onClose={onClose}>
      <ProfileForm {...props} onClose={onClose} />
    </Dialog>
  );
}

function ProfileForm({ self, canUpload, profile, onSave, onClose }: Omit<GroupProfileDialogProps, "open" | "groupName">) {
  const [name, setName] = useState(profile?.displayName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [photo, setPhoto] = useState(profile?.avatarUrl ?? "");
  const [upload, setUpload] = useState<{ progress: number; abort: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), bio: useId() };

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    if (INLINE_UPLOAD_TYPES[file.type] !== "image") return setError("Choose a PNG, JPEG, GIF, WebP or AVIF image.");
    if (file.size > MAX_PHOTO_BYTES) return setError("Photos can be up to 5 MB.");
    const handle = uploadFile(file, (progress) => setUpload((prev) => prev && { ...prev, progress }));
    setUpload({ progress: 0, abort: handle.abort });
    handle.promise.then(
      (result) => {
        setPhoto(result.url);
        setUpload(null);
      },
      (err: Error) => {
        setUpload(null);
        if (err.name !== "AbortError") setError(err.message);
      },
    );
  }

  async function save(next: MemberProfile | null) {
    setBusy(true);
    setError(undefined);
    const failure = await onSave(next);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  const cleanedName = name.trim().replace(/\s+/g, " ");
  const cleanedBio = bio.trim();
  const draft: MemberProfile = {
    ...(cleanedName && { displayName: cleanedName }),
    ...(cleanedBio && { bio: cleanedBio }),
    ...(photo && { avatarUrl: photo }),
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save(Object.keys(draft).length > 0 ? draft : null);
      }}
      className="space-y-4"
    >
      <p className="text-xs text-muted">
        These replace your usual name, photo and bio for everyone in this group. Leave one empty to use your usual one.
      </p>
      <div className="flex items-center gap-4">
        <Avatar
          name={cleanedName || self.name}
          color={self.color}
          src={photo || self.avatarUrl}
          size="lg"
          className="size-16 text-xl"
        />
        <div className="flex flex-wrap gap-2">
          {canUpload ? (
            <button
              type="button"
              disabled={Boolean(upload)}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-60"
            >
              <ImageUp aria-hidden className="size-3.5" />
              {upload ? `Uploading ${Math.round(upload.progress * 100)}%` : "Group photo"}
            </button>
          ) : (
            <p className="text-xs text-muted">Sign in with Google to use a different photo here.</p>
          )}
          {photo && !upload && (
            <button
              type="button"
              onClick={() => setPhoto("")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <Trash aria-hidden className="size-3.5" />
              Use my usual photo
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          hidden
          onChange={(event) => {
            pickPhoto(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <Field label="Display name" htmlFor={ids.name}>
        <Input
          id={ids.name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Bio" htmlFor={ids.bio}>
        <TextArea id={ids.bio} rows={3} maxLength={MAX_BIO_LENGTH} value={bio} onChange={(event) => setBio(event.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {profile && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(null)}
            className="h-9 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            Use my usual profile
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            upload?.abort();
            onClose();
          }}
          className="ml-auto h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || Boolean(upload)}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
