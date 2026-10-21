"use client";

import { useId, useState } from "react";
import {
  Ban,
  ChevronRight,
  Crown,
  Flag,
  LogOut,
  ScrollText,
  Search as SearchIcon,
  Shield,
  ShieldCheck,
  Tags,
  UserMinus,
  UserPen,
  UserPlus,
  UserRound,
  Volume2,
  VolumeOff,
  X,
} from "lucide-react";
import { Menu, type MenuItem } from "@/components/Menu";
import Input from "@/components/form/Input";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import type { GroupSettingsSection } from "@/components/chat/Manage";
import {
  allows,
  canAssignRoles,
  canBan,
  canLeave,
  canSetRole,
  canTransfer,
  mayActOn,
  memberStanding,
  isMuted,
  isOnline,
  roleOf,
  type Group,
  type GroupBan,
  type Member,
  type MemberProfile,
  type InviteLink,
  type InviteLinkResult,
  type MemberRole,
  type ModerationLogPage,
  type ReportsPage,
  type User as UserType,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import GroupProfileDialog from "./GroupProfileDialog";
import MemberDialog, { ASSIGNABLE_ROLES, MUTES, ROLE_LABELS } from "./MemberDialog";
import User from "./User";

/** Membership and moderation in the open group. Each resolves to an error message, or undefined on success. */
export type MemberActions = {
  join: () => Promise<string | undefined>;
  /** Set exactly which of the group's custom roles they hold. */
  setRoles: (userId: string, roles: string[]) => Promise<string | undefined>;
  leave: () => Promise<string | undefined>;
  invite: (userId: string) => Promise<string | undefined>;
  revokeInvite: (userId: string) => Promise<string | undefined>;
  /** People with a pending invite; `undefined` if they couldn't be loaded. */
  loadInvites: () => Promise<UserType[] | undefined>;
  setRole: (userId: string, role: Exclude<MemberRole, "owner">) => Promise<string | undefined>;
  /** `until: null` unmutes. */
  mute: (userId: string, until: number | null) => Promise<string | undefined>;
  kick: (userId: string) => Promise<string | undefined>;
  /** Without `until` the ban is permanent. */
  ban: (userId: string, options: { reason?: string; until?: number }) => Promise<string | undefined>;
  transfer: (userId: string) => Promise<string | undefined>;
  unban: (userId: string) => Promise<string | undefined>;
  /** Active bans; `undefined` if they couldn't be loaded. */
  loadBans: () => Promise<GroupBan[] | undefined>;
  /** A page of the moderation log (admins and up); `undefined` if it couldn't be loaded. */
  loadModerationLog: (before?: string) => Promise<ModerationLogPage | undefined>;
  /** Open reports (moderators and up); `undefined` if they couldn't be loaded. */
  loadReports: () => Promise<ReportsPage | undefined>;
  resolveReport: (id: string, remove: boolean) => Promise<string | undefined>;
  /** Invite links (moderators and up). */
  createInviteLink: (options: { expiresIn?: number; maxUses?: number }) => Promise<InviteLinkResult>;
  loadInviteLinks: () => Promise<InviteLink[] | undefined>;
  revokeInviteLink: (code: string) => Promise<string | undefined>;
  /** Your own profile in the group; `null` goes back to your app-wide one. */
  setProfile: (profile: MemberProfile | null) => Promise<string | undefined>;
};

type UsersProps = {
  /** Everyone, with their group profiles applied. */
  users: Record<string, UserType>;
  group: Group;
  actions: MemberActions;
  /** Signed-in users can upload a group photo. */
  canUpload: boolean;
  /** Shows the panel as a drawer over the chat (small screens) with a close button. */
  onClose?: () => void;
  /** Signed-in users: start (or open) a direct message with someone. Resolves to an error message. */
  onMessage?: (userId: string) => Promise<string | undefined>;
  /** Invites, bans, reports and the log are sections of the group's settings screen: open it at one. */
  onOpenSettings?: (section: GroupSettingsSection) => void;
  className?: string;
};

/** Past this many people, the list gets a search box. */
const SEARCH_FROM = 8;

const SECTIONS: { role: MemberRole; title: string }[] = [
  { role: "owner", title: "Owner" },
  { role: "admin", title: "Admins" },
  { role: "moderator", title: "Moderators" },
  { role: "member", title: "Members" },
];

export default function Users({ users, group, actions, canUpload, onClose, onMessage, onOpenSettings, className }: UsersProps) {
  const { state } = useChatContext();
  const { selfId } = state;
  // `undefined` while loading.
  const members = state.members[group.id];
  // You as everyone sees you outside the group (`users` has your group profile applied).
  const appSelf = state.users[selfId];
  // You can't leave a one-on-one conversation.
  const oneOnOne = group.kind === "dm" && (group.members?.length ?? 0) <= 2;
  const [managing, setManaging] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [query, setQuery] = useState("");
  const [offlineOpen, setOfflineOpen] = useState(true);
  const searchId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const self = users[selfId];
  const selfMember = members?.find((m) => m.user.id === selfId);
  const selfRole = roleOf(members, self, group.kind === "dm");
  const selfStanding = memberStanding(members, self, group);
  /** Their standing here (rank and custom roles); unknown people count as plain members. */
  const standingOf = (member: Member, targetRole: MemberRole) => memberStanding(members, member.user, group) ?? { role: targetRole };
  const groupRoles = group.kind === "dm" ? [] : (group.roles ?? []);
  // Presence comes from the live user records; member entries are a snapshot.
  const withLive = (member: Member): Member => ({ ...member, user: users[member.user.id] ?? member.user });
  const listed = (members ?? [])
    .map(withLive)
    // Guests are gone once they leave; only signed-in members are listed offline.
    .filter((m) => isOnline(m.user) || !m.user.id.startsWith("guest-"))
    .sort((a, b) => Number(isOnline(b.user)) - Number(isOnline(a.user)) || a.user.name.localeCompare(b.user.name));
  const managed = managing ? listed.find((m) => m.user.id === managing) : undefined;
  // Nobody moderates direct messages, so they have no log or reports.
  const showLog = group.kind !== "dm" && allows(selfStanding, "GROUP:AUDIT");
  const showReports = group.kind !== "dm" && allows(selfStanding, "MESSAGE:MANAGE");
  const openReports = state.reports[group.id] ?? 0;

  async function run(action: Promise<string | undefined>) {
    setBusy(true);
    setError(undefined);
    const failure = await action;
    setBusy(false);
    setError(failure);
    setConfirmLeave(false);
  }

  /**
   * A member's menu actions: what your role allows on them (the same rules as
   * the member dialog, which bans and ownership transfers still open for their
   * reason, duration or confirmation). Your own row: your profiles, and leaving.
   */
  function menuItems(member: Member, targetRole: MemberRole): MenuItem[] {
    const { user } = member;
    const profile: MenuItem = {
      label: "View profile",
      icon: <UserRound className="size-4" />,
      onSelect: () => setManaging(user.id),
    };
    if (user.id === selfId) {
      return [
        profile,
        { label: "Your profile in this group…", icon: <UserPen className="size-4" />, onSelect: () => setEditingProfile(true) },
        ...(groupRoles.length > 0 && canAssignRoles(selfRole, targetRole, true)
          ? [{ label: "Your roles…", icon: <Tags className="size-4" />, onSelect: () => setManaging(user.id) }]
          : []),
        ...(canLeave(member.role) && !oneOnOne
          ? [
              {
                label: "Leave group",
                icon: <LogOut className="size-4" />,
                danger: true,
                confirm: `Click again to leave ${group.name}`,
                onSelect: () => void run(actions.leave()),
              },
            ]
          : []),
      ];
    }
    const actor = selfRole;
    const roles = actor ? ASSIGNABLE_ROLES.filter((role) => role !== member.role && canSetRole(actor, targetRole, role)) : [];
    const target = standingOf(member, targetRole);
    const moderate = mayActOn(selfStanding, target, "MEMBER:KICK");
    const mute = mayActOn(selfStanding, target, "MEMBER:MUTE");
    const assignRoles = groupRoles.length > 0 && canAssignRoles(actor, targetRole, false);
    const ban = Boolean(actor && canBan(actor, targetRole));
    const transfer = Boolean(actor && canTransfer(actor, selfId, user.id));
    const moderation: MenuItem[] = [
      ...roles.map((role) => ({
        label: `Make ${ROLE_LABELS[role].toLowerCase()}`,
        icon: <Shield className="size-4" />,
        onSelect: () => void run(actions.setRole(user.id, role)),
      })),
      ...(assignRoles ? [{ label: "Roles…", icon: <Tags className="size-4" />, onSelect: () => setManaging(user.id) }] : []),
      ...(!mute
        ? []
        : isMuted(member)
          ? [{ label: "Unmute", icon: <Volume2 className="size-4" />, onSelect: () => void run(actions.mute(user.id, null)) }]
          : MUTES.map(({ label, ms }) => ({
              label: `Mute for ${label}`,
              icon: <VolumeOff className="size-4" />,
              onSelect: () => void run(actions.mute(user.id, Date.now() + ms)),
            }))),
      ...(moderate
        ? [
            {
              label: "Remove from group",
              icon: <UserMinus className="size-4" />,
              danger: true,
              confirm: `Click again to remove ${user.name}`,
              onSelect: () => void run(actions.kick(user.id)),
            },
          ]
        : []),
      ...(ban ? [{ label: "Ban…", icon: <Ban className="size-4" />, danger: true, onSelect: () => setManaging(user.id) }] : []),
      ...(transfer
        ? [{ label: "Transfer ownership…", icon: <Crown className="size-4" />, onSelect: () => setManaging(user.id) }]
        : []),
    ];
    return [profile, ...(moderation.length > 0 ? [{ kind: "label" as const, label: "Moderate" }, ...moderation] : [])];
  }

  // Finding someone, once there are enough people to need it.
  const searchable = listed.length > SEARCH_FROM;
  const needle = searchable ? query.trim().toLowerCase() : "";
  const matching = needle ? listed.filter((m) => m.user.name.toLowerCase().includes(needle)) : listed;
  const onlineMembers = matching.filter((m) => isOnline(m.user));
  const offlineMembers = matching.filter((m) => !isOnline(m.user));
  const onlineCount = listed.filter((m) => isOnline(m.user)).length;
  const canBanHere = Boolean(selfRole && canBan(selfRole, "member"));
  const moderation: MenuItem[] = [
    ...(canBanHere ? [{ label: "Bans", icon: <Ban className="size-4" />, onSelect: () => onOpenSettings?.("bans") }] : []),
    ...(showReports
      ? [
          {
            label: "Reports",
            icon: <Flag className="size-4" />,
            description: openReports > 0 ? `${openReports} open` : "None open",
            onSelect: () => onOpenSettings?.("reports"),
          },
        ]
      : []),
    ...(showLog ? [{ label: "Moderation log", icon: <ScrollText className="size-4" />, onSelect: () => onOpenSettings?.("log") }] : []),
  ];

  const row = (member: Member, withRole = false) => {
    const targetRole = roleOf(members, member.user, group.kind === "dm") ?? member.role;
    return (
      <User
        key={member.user.id}
        user={member.user}
        isSelf={member.user.id === selfId}
        muted={isMuted(member)}
        role={withRole && member.role !== "member" ? ROLE_LABELS[member.role] : undefined}
        customRole={groupRoles.find((r) => member.roles?.includes(r.id))}
        items={menuItems(member, targetRole)}
        onOpen={() => setManaging(member.user.id)}
      />
    );
  };
  const heading = (title: string, count: number) => (
    <h2 className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
      {title}
      <span className="font-normal tabular-nums">{count}</span>
    </h2>
  );

  const panel = (
    <aside
      aria-label="Members"
      className={cn(
        "shrink-0 flex-col border-l border-border bg-surface",
        onClose ? "fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw]" : "w-64",
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm leading-tight font-semibold">Members</h2>
          {members && (
            <p className="flex items-center gap-1.5 text-xs text-muted tabular-nums">
              <span aria-hidden className="size-1.5 rounded-full bg-online" />
              {onlineCount} online · {listed.length} {listed.length === 1 ? "person" : "people"}
            </p>
          )}
        </div>
        {allows(selfStanding, "MEMBER:INVITE") && (
          <button
            type="button"
            onClick={() => onOpenSettings?.("invites")}
            aria-label={`Invite people to ${group.name}`}
            title="Invite people"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <UserPlus className="size-4" />
          </button>
        )}
        {moderation.length > 0 && (
          <Menu
            label="Moderation"
            align="end"
            className="w-56"
            items={[{ kind: "label", label: "Moderation" }, ...moderation]}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-label={openReports > 0 ? `Moderation: ${openReports} open reports` : "Moderation"}
                title="Moderation"
                className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2 aria-expanded:text-foreground"
              >
                <ShieldCheck className="size-4" />
                {openReports > 0 && (
                  <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger-strong px-0.5 text-[9px] font-bold text-white tabular-nums">
                    {openReports > 99 ? "99+" : openReports}
                  </span>
                )}
              </button>
            )}
          />
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close members"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      {searchable && (
        <div className="shrink-0 px-3 pt-3">
          <label htmlFor={searchId} className="sr-only">
            Find a member
          </label>
          <div className="relative">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <Input
              id={searchId}
              size="sm"
              type="search"
              value={query}
              placeholder="Find a member"
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-2 pt-3">
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {!members && (
          <ul aria-label="Loading members" className="space-y-1">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-2 py-1.5">
                <span className="size-8 animate-pulse rounded-full bg-surface-2" />
                <span className="h-3 w-28 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        )}

        {/* Online people by role; offline ones together after them (with their role beside them). */}
        {SECTIONS.map(({ role, title }) => {
          const list = onlineMembers.filter((m) => m.role === role);
          if (list.length === 0) return null;
          return (
            <section key={role}>
              {heading(title, list.length)}
              <ul>{list.map((member) => row(member))}</ul>
            </section>
          );
        })}
        {offlineMembers.length > 0 && (
          <details open={offlineOpen} onToggle={(event) => setOfflineOpen(event.currentTarget.open)} className="group/offline">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-3.5 transition-transform group-open/offline:rotate-90" />
              Offline
              <span className="font-normal tabular-nums">{offlineMembers.length}</span>
            </summary>
            <ul>{offlineMembers.map((member) => row(member, true))}</ul>
          </details>
        )}
        {members && needle && matching.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted">Nobody here matches “{query.trim()}”.</p>
        )}
      </div>

      {/* You here: your profile in the group, and leaving it. */}
      {selfMember && self && (
        <footer className="shrink-0 border-t border-border p-2">
          {confirmLeave ? (
            <div className="flex items-center gap-1 rounded-lg bg-danger/10 p-1.5">
              <span className="min-w-0 flex-1 px-1 text-xs">Leave {group.name}?</span>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="h-8 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                disabled={busy}
                onClick={() => void run(actions.leave())}
                className="h-8 rounded-md bg-danger-strong px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Leave
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1">
              <Avatar name={self.name} color={self.color} src={self.avatarUrl} size="sm" status={self.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{self.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {group.kind === "dm" ? "You" : `${ROLE_LABELS[selfMember.role]} here`}
                  {selfMember.profile && " · group profile"}
                </span>
              </span>
              {group.kind !== "dm" && (
                <button
                  type="button"
                  onClick={() => setEditingProfile(true)}
                  aria-label={`Your profile in ${group.name}`}
                  title="Your profile in this group"
                  className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  <UserPen className="size-4" />
                </button>
              )}
              {canLeave(selfMember.role) && !oneOnOne && (
                <button
                  type="button"
                  onClick={() => setConfirmLeave(true)}
                  aria-label={`Leave ${group.name}`}
                  title={group.kind === "dm" ? "Leave conversation" : "Leave group"}
                  className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"
                >
                  <LogOut className="size-4" />
                </button>
              )}
            </div>
          )}
        </footer>
      )}

      <MemberDialog
        member={managed ?? null}
        targetRole={managed ? (roleOf(members, managed.user, group.kind === "dm") ?? managed.role) : "member"}
        selfId={selfId}
        selfRole={selfRole}
        groupName={group.name}
        groupRoles={groupRoles}
        selfStanding={selfStanding}
        targetStanding={managed ? standingOf(managed, roleOf(members, managed.user, group.kind === "dm") ?? managed.role) : undefined}
        actions={actions}
        onMessage={
          onMessage && managed && !managed.user.id.startsWith("guest-") && managed.user.role !== "bot"
            ? () => onMessage(managed.user.id)
            : undefined
        }
        onClose={() => setManaging(null)}
      />
      {selfMember && appSelf && (
        <GroupProfileDialog
          open={editingProfile}
          groupName={group.name}
          self={appSelf}
          canUpload={canUpload}
          profile={selfMember.profile}
          onSave={actions.setProfile}
          onClose={() => setEditingProfile(false)}
        />
      )}
    </aside>
  );
  if (!onClose) return panel;
  return (
    <>
      <div aria-hidden className={cn("fixed inset-0 z-30 bg-black/50", className)} onClick={onClose} />
      {panel}
    </>
  );
}
