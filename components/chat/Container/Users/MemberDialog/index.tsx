"use client";

import { useId, useState } from "react";
import { Ban, Crown, MessageCircle, UserMinus, VolumeOff } from "lucide-react";
import Dialog from "@/components/Dialog";
import { CustomStatus, STATUS_LABELS } from "@/components/chat/Status";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Select from "@/components/form/Select";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { formatDateTime } from "@/lib/chat/format";
import { canBan, canModerate, canMute, canSetRole, canTransfer, isMuted, type Member, type MemberRole } from "@/lib/chat/types";
import type { MemberActions } from "..";

export const ASSIGNABLE_ROLES = ["admin", "moderator", "member"] as const;

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  moderator: "Moderator",
  member: "Member",
};

const HOUR = 60 * 60 * 1000;
export const MUTES = [
  { label: "1 hour", ms: HOUR },
  { label: "1 day", ms: 24 * HOUR },
  { label: "1 week", ms: 7 * 24 * HOUR },
];
const BANS = [
  { label: "1 day", ms: 24 * HOUR },
  { label: "1 week", ms: 7 * 24 * HOUR },
  { label: "30 days", ms: 30 * 24 * HOUR },
  { label: "Forever", ms: 0 },
];

type MemberDialogProps = {
  /** The member being managed; the dialog is open while set. */
  member: Member | null;
  /** Their effective role (app-wide admins count as group admins). */
  targetRole: MemberRole;
  selfId: string;
  /** Your role in the group; absent if you haven't joined (then it's a plain profile). */
  selfRole?: MemberRole;
  groupName: string;
  actions: MemberActions;
  /** Message them directly (absent when you can't). Resolves to an error message. */
  onMessage?: () => Promise<string | undefined>;
  onClose: () => void;
};

/**
 * Someone's profile in the group, plus the moderation your role allows: role
 * changes, mutes, removal, bans and ownership transfer.
 */
export default function MemberDialog({ member, onClose, ...props }: MemberDialogProps) {
  return (
    <Dialog open={Boolean(member)} title={member?.user.name ?? "Member"} onClose={onClose}>
      {member && <Controls key={member.user.id} member={member} onClose={onClose} {...props} />}
    </Dialog>
  );
}

function Controls({
  member,
  targetRole,
  selfId,
  selfRole,
  groupName,
  actions,
  onMessage,
  onClose,
}: Omit<MemberDialogProps, "member"> & { member: Member }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reason, setReason] = useState("");
  const [banFor, setBanFor] = useState(BANS[1].ms);
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const ids = { reason: useId(), duration: useId() };
  const { user } = member;

  // Nothing to do to yourself, or without a role in the group.
  const actor = user.id !== selfId ? selfRole : undefined;
  const roles = actor
    ? ASSIGNABLE_ROLES.filter((role) => role !== member.role && canSetRole(actor, targetRole, role))
    : [];
  const moderate = Boolean(actor && canModerate(actor, targetRole));
  const mute = Boolean(actor && canMute(actor, targetRole));
  const ban = Boolean(actor && canBan(actor, targetRole));
  const transfer = Boolean(actor && canTransfer(actor, selfId, user.id));
  const muted = isMuted(member);

  /** Run an action; removals close the dialog since the member is gone. */
  async function run(action: Promise<string | undefined>, close = false) {
    setBusy(true);
    setError(undefined);
    const failure = await action;
    setBusy(false);
    if (failure) setError(failure);
    else if (close) onClose();
  }

  const button =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";

  return (
    <div className="space-y-5">
      <div>
        {user.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded cover photo
          <img src={user.posterUrl} alt="" className="mb-3 h-24 w-full rounded-xl object-cover" />
        )}
        <div className="flex items-center gap-3">
          <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user.name}</p>
            <p className="text-xs text-muted">
              {STATUS_LABELS[user.status]} · {ROLE_LABELS[member.role]} in {groupName}
              {user.role === "admin" && " · App admin"}
              {muted && ` · Muted until ${formatDateTime(member.mutedUntil!)}`}
            </p>
            <CustomStatus user={user} className="mt-0.5 text-xs" />
          </div>
          {onMessage && user.id !== selfId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(onMessage(), true)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              <MessageCircle aria-hidden className="size-3.5" />
              Message
            </button>
          )}
        </div>
        {user.bio && <p className="mt-3 text-sm whitespace-pre-line">{user.bio}</p>}
      </div>

      {roles.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Role</h3>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                disabled={busy}
                onClick={() => void run(actions.setRole(user.id, role))}
                className={button}
              >
                Make {ROLE_LABELS[role].toLowerCase()}
              </button>
            ))}
          </div>
        </section>
      )}

      {mute && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Mute</h3>
          {muted ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-muted">
                Muted until {formatDateTime(member.mutedUntil!)}.
              </p>
              <button type="button" disabled={busy} onClick={() => void run(actions.mute(user.id, null))} className={button}>
                Unmute
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {MUTES.map(({ label, ms }) => (
                <button
                  key={label}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(actions.mute(user.id, Date.now() + ms))}
                  className={button}
                >
                  <VolumeOff aria-hidden className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {moderate && (
        <section>
          <h3 className="mb-1 text-sm font-medium">Remove</h3>
          <p className="mb-2 text-xs text-muted">They can rejoin a public group, or a private one with a new invite.</p>
          <button type="button" disabled={busy} onClick={() => void run(actions.kick(user.id), true)} className={button}>
            <UserMinus aria-hidden className="size-3.5" />
            Remove from {groupName}
          </button>
        </section>
      )}

      {ban && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Ban</h3>
          <p className="text-xs text-muted">Removes them and stops them seeing or rejoining the group.</p>
          <Field label="Reason" htmlFor={ids.reason} optional>
            <Input id={ids.reason} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="For" htmlFor={ids.duration} className="flex-1">
              <Select
                id={ids.duration}
                value={String(banFor)}
                onChange={(next) => setBanFor(Number(next ?? 0))}
                options={BANS.map(({ label, ms }) => ({ value: String(ms), label }))}
              />
            </Field>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  actions.ban(user.id, {
                    ...(reason.trim() && { reason: reason.trim() }),
                    ...(banFor > 0 && { until: Date.now() + banFor }),
                  }),
                  true,
                )
              }
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-danger-strong px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Ban aria-hidden className="size-4" />
              Ban
            </button>
          </div>
        </section>
      )}

      {transfer && (
        <section>
          <h3 className="mb-1 text-sm font-medium">Ownership</h3>
          {confirmTransfer ? (
            <>
              <p className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs">
                {user.name} becomes the owner of {groupName} and you become an admin. Only they can give it back.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmTransfer(false)} className={button}>
                  Cancel
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={busy}
                  onClick={() => void run(actions.transfer(user.id), true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-danger-strong px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Crown aria-hidden className="size-3.5" />
                  Transfer ownership
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmTransfer(true)} className={button}>
              <Crown aria-hidden className="size-3.5" />
              Make owner
            </button>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
