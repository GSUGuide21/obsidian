"use client";

import { useState } from "react";
import { Bell, Globe, Lock, LogOut, Pencil, Settings2, UserPen } from "lucide-react";
import Field from "@/components/form/Field";
import Select from "@/components/form/Select";
import ChannelIcon, { channelTypeLabel } from "@/components/chat/ChannelIcon";
import GroupProfileDialog from "@/components/chat/Container/Users/GroupProfileDialog";
import { ROLE_LABELS } from "@/components/chat/Container/Users/MemberDialog";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { CustomStatus, STATUS_LABELS } from "@/components/chat/Status";
import {
  canLeave,
  isDm,
  isMuted,
  notificationLevel,
  type Group,
  type NotificationLevel,
  type Subgroup,
} from "@/lib/chat/types";
import { formatDateTime } from "@/lib/chat/format";
import { cn } from "@/lib/utils";

const LEVEL_LABELS: Record<NotificationLevel, string> = {
  all: "All messages",
  mentions: "Mentions and replies",
  none: "Nothing",
};

// The "This chat" sections of the group settings screen (see components/chat/GroupSettings):
// what the chat is, its notifications, and you in it. Everyone in it gets them, direct messages too.

const card = "rounded-xl bg-surface-2 p-3";
const button =
  "inline-flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-sm font-medium hover:bg-surface disabled:opacity-50";

/** What the chat is: the group (or the people in a direct message) and this channel. */
export function About({
  group,
  subgroup,
  onEditGroup,
  onEditChannel,
}: {
  group: Group;
  subgroup: Subgroup;
  /** Those who manage the group: its details (the screen's Overview), or this channel's settings. */
  onEditGroup?: () => void;
  onEditChannel?: () => void;
}) {
  const { state } = useChatContext();
  const members = state.members[group.id];

  if (isDm(group)) {
    const people = (group.members ?? []).flatMap((id) => (state.users[id] ? [state.users[id]] : []));
    return (
      <section aria-label="About" className="space-y-3">
        <p className="text-xs text-muted">
          A direct message between {people.length} {people.length === 1 ? "person" : "people"}. Only they can see it.
        </p>
        <ul className="space-y-1">
          {people.map((user) => (
            <li key={user.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="sm" status={user.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {user.name}
                  {user.id === state.selfId && <span className="ml-1.5 text-[11px] font-normal text-muted">you</span>}
                </span>
                {user.statusEmoji || user.statusText ? (
                  <CustomStatus user={user} className="text-xs text-muted" />
                ) : (
                  <span className="block text-xs text-muted">{STATUS_LABELS[user.status]}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const Visibility = group.visibility === "private" ? Lock : Globe;
  return (
    <section aria-label="About" className="space-y-4">
      <div className={cn(card, "flex items-start gap-3")}>
        <Avatar name={group.name} color={group.color} shape="square" size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{group.name}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Visibility aria-hidden className="size-3" />
            {group.visibility === "private" ? "Private: invited people only" : "Public: anyone can find and join it"}
            {members && ` · ${members.length} ${members.length === 1 ? "member" : "members"}`}
          </span>
          {group.description && <span className="mt-1.5 block text-sm whitespace-pre-line">{group.description}</span>}
        </span>
        {onEditGroup && (
          <button type="button" onClick={onEditGroup} className={cn(button, "shrink-0")}>
            <Settings2 aria-hidden className="size-4 text-muted" />
            Edit group
          </button>
        )}
      </div>

      <div className={cn(card, "flex items-start gap-3")}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface">
          <ChannelIcon type={subgroup.type} className="size-5 text-muted" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">#{subgroup.name}</span>
          <span className="block text-xs text-muted">
            {channelTypeLabel[subgroup.type ?? "text"]}
            {subgroup.category && ` · in ${subgroup.category}`}
          </span>
          {subgroup.topic && <span className="mt-1.5 block text-sm">{subgroup.topic}</span>}
        </span>
        {onEditChannel && (
          <button type="button" onClick={onEditChannel} className={cn(button, "shrink-0")}>
            <Pencil aria-hidden className="size-4 text-muted" />
            Edit channel
          </button>
        )}
      </div>
    </section>
  );
}

/** This channel's and this group's notification levels, and what applies. */
export function Notifications({ group, subgroup }: { group: Group; subgroup: Subgroup }) {
  const { state, setNotificationLevel, markAllRead } = useChatContext();
  const [error, setError] = useState<string>();
  const [marked, setMarked] = useState(false);
  const unreadHere = group.subgroups.some((s) => (state.unread[s.id] ?? 0) + (state.mentions[s.id] ?? 0) > 0);
  const dm = isDm(group);
  const groupDefault: NotificationLevel = dm ? "all" : "mentions";
  const groupLevel = state.notifications[group.id] ?? null;
  const channelLevel = state.notifications[subgroup.id] ?? null;
  const effective = notificationLevel(state.notifications, group, subgroup.id);

  async function set(targetId: string, value: string | null, previous: NotificationLevel | null) {
    setError(undefined);
    const level = !value || value === "default" ? null : (value as NotificationLevel);
    const failure = await setNotificationLevel(targetId, level, previous);
    if (failure) setError(failure);
  }
  const levels = (["all", "mentions", "none"] as const).map((level) => ({ value: level, label: LEVEL_LABELS[level] }));

  return (
    <section aria-label="Notifications" className="space-y-4">
      <p className={cn(card, "flex items-center gap-2 text-sm")}>
        <Bell aria-hidden className="size-4 shrink-0 text-muted" />
        <span>
          You&apos;re notified about <strong className="font-medium">{LEVEL_LABELS[effective].toLowerCase()}</strong>{" "}
          {dm ? "in this conversation" : `in #${subgroup.name}`}.
        </span>
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={dm ? "This conversation" : `#${subgroup.name}`}
          htmlFor="chat-notify-channel"
          hint={dm ? undefined : "Overrides the group's setting for this channel."}
        >
          <Select
            id="chat-notify-channel"
            value={channelLevel ?? "default"}
            onChange={(value) => void set(subgroup.id, value, channelLevel)}
            options={[
              {
                value: "default",
                label: dm ? `Default (${LEVEL_LABELS[groupDefault]})` : `Same as the group (${LEVEL_LABELS[groupLevel ?? groupDefault]})`,
              },
              ...levels,
            ]}
          />
        </Field>
        {!dm && (
          <Field label={`All of ${group.name}`} htmlFor="chat-notify-group" hint="Channels without their own setting follow this.">
            <Select
              id="chat-notify-group"
              value={groupLevel ?? "default"}
              onChange={(value) => void set(group.id, value, groupLevel)}
              options={[{ value: "default", label: `Default (${LEVEL_LABELS[groupDefault]})` }, ...levels]}
            />
          </Field>
        )}
      </div>
      {!dm && (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted">
            {marked ? "Everything here is marked as read." : "Clear the unread counts of every channel in this group."}
          </p>
          <button
            type="button"
            disabled={!unreadHere}
            onClick={async () => {
              setError(undefined);
              const failure = await markAllRead(group.id);
              if (failure) setError(failure);
              else setMarked(true);
            }}
            className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
      )}
    </section>
  );
}

/** You in this chat: your role, your profile here, and leaving it. */
export function You({ group, signedIn, onLeft }: { group: Group; signedIn: boolean; onLeft: () => void }) {
  const { state, leaveGroup, setGroupProfile } = useChatContext();
  const [editingProfile, setEditingProfile] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const self = state.users[state.selfId];
  const member = state.members[group.id]?.find((m) => m.user.id === state.selfId);
  const dm = isDm(group);
  const oneOnOne = dm && (group.members?.length ?? 0) <= 2;
  const role = member?.role ?? group.role;

  if (!role || !self) {
    return <p className="py-6 text-center text-sm text-muted">You haven&apos;t joined {group.name}.</p>;
  }
  const leavable = canLeave(role) && !oneOnOne;

  async function leave() {
    setBusy(true);
    setError(undefined);
    const failure = await leaveGroup(group.id);
    setBusy(false);
    if (failure) {
      setConfirmLeave(false);
      return setError(failure);
    }
    onLeft();
  }

  return (
    <section aria-label="You here" className="space-y-4">
      <div className={cn(card, "flex items-center gap-3")}>
        <Avatar
          name={member?.profile?.displayName ?? self.name}
          color={self.color}
          src={member?.profile?.avatarUrl ?? self.avatarUrl}
          size="lg"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{member?.profile?.displayName ?? self.name}</span>
          <span className="block text-xs text-muted">
            {dm ? "In this conversation" : `${ROLE_LABELS[role]} in ${group.name}`}
            {member?.profile && " · using a group profile"}
          </span>
          {member && isMuted(member) && (
            <span className="block text-xs text-warning">
              Muted until {formatDateTime(member.mutedUntil!)}: you can read but not post.
            </span>
          )}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!dm && (
          <button type="button" onClick={() => setEditingProfile(true)} className={button}>
            <UserPen aria-hidden className="size-4 text-muted" />
            Your profile in this group
          </button>
        )}
        {leavable &&
          (confirmLeave ? (
            <span className="flex items-center gap-2 rounded-lg bg-danger/10 px-2 py-1">
              <span className="text-sm">Leave {dm ? "this conversation" : group.name}?</span>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="h-8 rounded-lg px-3 text-xs font-medium text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void leave()}
                className="h-8 rounded-lg bg-danger-strong px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Leave
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmLeave(true)} className={cn(button, "text-danger")}>
              <LogOut aria-hidden className="size-4" />
              Leave {dm ? "conversation" : "group"}
            </button>
          ))}
      </div>
      {!leavable && role === "owner" && (
        <p className="text-xs text-muted">You own this group: transfer ownership (from the members panel) before leaving.</p>
      )}

      {!dm && (
        <GroupProfileDialog
          open={editingProfile}
          groupName={group.name}
          self={self}
          canUpload={signedIn}
          profile={member?.profile}
          onSave={(profile) => setGroupProfile(group.id, profile)}
          onClose={() => setEditingProfile(false)}
        />
      )}
    </section>
  );
}
