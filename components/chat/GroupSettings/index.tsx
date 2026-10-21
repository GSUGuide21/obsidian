"use client";

import type { ReactNode } from "react";
import {
  Ban,
  Bell,
  Bot,
  Flag,
  FolderTree,
  Hourglass,
  Info,
  OctagonX,
  ScrollText,
  Settings2,
  ShieldOff,
  Smile,
  Tags,
  Sticker,
  UserPlus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { About, Notifications, You } from "@/components/chat/ChatSettings";
import { BanList } from "@/components/chat/Container/Users/BansDialog";
import { InvitePanel } from "@/components/chat/Container/Users/InviteDialog";
import { LogList } from "@/components/chat/Container/Users/ModerationLogDialog";
import { ReportList } from "@/components/chat/Container/Users/ReportsDialog";
import type { MemberActions } from "@/components/chat/Container/Users";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import SettingsLayout, { SectionBadge } from "@/components/chat/SettingsLayout";
import {
  BlockedWordsForm,
  BotManager,
  DeleteGroup,
  GroupOverview,
  type GroupSettingsSection,
} from "@/components/chat/Manage";
import {
  allows,
  canBan,
  canEditGroup,
  canManageGroup,
  canManageRoles,
  dmName,
  groupRole,
  groupStanding,
  isDm,
  type Group,
  type Subgroup,
  type User,
} from "@/lib/chat/types";
import { COLLAPSED_SECTIONS, renameInPersistentSet } from "@/lib/chat/prefs";
import { uploadFile } from "@/lib/chat/upload";
import CategoriesSettings from "./Categories";
import DisappearingSettings from "./Disappearing";
import EmojiSettings from "./Emoji";
import RolesSettings from "./Roles";

type Section = {
  id: GroupSettingsSection;
  label: string;
  /** Under the section's title. */
  description: string;
  icon: LucideIcon;
};

/** Every section, in order, under its heading; each is shown only to those its `can` allows (see visibleSections). */
const GROUPS: { heading: string; sections: Section[] }[] = [
  {
    heading: "This chat",
    sections: [
      { id: "about", label: "About", description: "What this chat is, and who's in it.", icon: Info },
      { id: "notifications", label: "Notifications", description: "What you're notified about here.", icon: Bell },
      {
        id: "disappearing",
        label: "Disappearing messages",
        description: "Delete messages here for everyone once they're an hour, a day or a week old.",
        icon: Hourglass,
      },
      { id: "you", label: "You here", description: "Your role, your profile here, and leaving.", icon: UserRound },
    ],
  },
  {
    heading: "Group",
    sections: [
      { id: "overview", label: "Overview", description: "Its name, description, color and who can see it.", icon: Settings2 },
      { id: "categories", label: "Categories", description: "The sections the group's channels are sorted into in the sidebar.", icon: FolderTree },
      { id: "words", label: "Blocked words", description: "Words and phrases members' messages can't contain.", icon: ShieldOff },
      { id: "emoji", label: "Emoji", description: "Custom emoji members use as :name: in messages and reactions.", icon: Smile },
      { id: "stickers", label: "Stickers", description: "The group's sticker pack: images members send on their own, shown big.", icon: Sticker },
      { id: "bots", label: "Bots", description: "Outside services that add slash commands here.", icon: Bot },
    ],
  },
  {
    heading: "People",
    sections: [
      { id: "roles", label: "Roles", description: "Named, colored roles that give members extra permissions.", icon: Tags },
      { id: "invites", label: "Invites", description: "Links that let people join, and invitations by name.", icon: UserPlus },
      { id: "bans", label: "Bans", description: "Who's banned, why, and until when.", icon: Ban },
    ],
  },
  {
    heading: "Moderation",
    sections: [
      { id: "reports", label: "Reports", description: "Messages members flagged, to remove or dismiss.", icon: Flag },
      { id: "log", label: "Moderation log", description: "Who moderated what, with what changed.", icon: ScrollText },
    ],
  },
  {
    heading: "",
    sections: [{ id: "danger", label: "Danger zone", description: "Deleting the group, for everyone.", icon: OctagonX }],
  },
];

/** The sections your role here lets you see (the server checks every action again). */
export function visibleSections(group: Group, self: User | undefined): Set<GroupSettingsSection> {
  const role = groupRole(group, self);
  const standing = groupStanding(group, self);
  const manage = canManageGroup(group, self);
  // Anyone looking at the chat can see what it is and choose its notifications.
  const allowed = new Set<GroupSettingsSection>(["about", "notifications"]);
  if (role) allowed.add("you");
  // A direct message's timer is anyone's in it to set; a group's, its managers'.
  if (role && (group.kind === "dm" || manage)) allowed.add("disappearing");
  // Nobody manages or moderates direct messages.
  if (group.kind === "dm" || !role) return allowed;
  // The group itself is for ranks; channels, emoji, stickers and bots also for custom roles that grant it.
  if (canEditGroup(group, self)) ["overview", "words"].forEach((s) => allowed.add(s as GroupSettingsSection));
  if (manage) ["categories", "emoji", "stickers", "bots"].forEach((s) => allowed.add(s as GroupSettingsSection));
  if (canManageRoles(role)) allowed.add("roles");
  if (allows(standing, "MEMBER:INVITE")) allowed.add("invites");
  if (canBan(role, "member")) allowed.add("bans");
  if (allows(standing, "MESSAGE:MANAGE")) allowed.add("reports");
  if (allows(standing, "GROUP:AUDIT")) allowed.add("log");
  // Only the owner deletes a group (and app-wide admins, anywhere).
  if (group.role === "owner" || self?.role === "admin") allowed.add("danger");
  return allowed;
}

type GroupSettingsProps = {
  group: Group;
  /** The channel open in it (About and Notifications are partly about it). */
  subgroup: Subgroup;
  /** Signed-in users can upload a photo for their group profile. */
  signedIn: boolean;
  /** Everyone, with their group profiles applied. */
  users: Record<string, User>;
  /** Bound to this group (it's the open one while its settings are). */
  actions: MemberActions;
  section?: GroupSettingsSection;
  onSection: (section: GroupSettingsSection) => void;
  /** Back to the chat. */
  onClose: () => void;
  onDeleted: () => void;
  /** You left it (or the conversation). */
  onLeft: () => void;
  /** Those who manage the group: the open channel's settings (a dialog). */
  onEditChannel?: () => void;
  onOpenSidebar: () => void;
};

/**
 * A chat's settings, as a screen in place of it: its sections down the side
 * (along the top on small screens), the open one beside them. Everyone gets
 * the "This chat" sections; the rest are for those whose role allows them.
 * Direct messages have only the first ones.
 */
export default function GroupSettings({
  group,
  subgroup,
  signedIn,
  users,
  actions,
  section,
  onSection,
  onClose,
  onDeleted,
  onLeft,
  onEditChannel,
  onOpenSidebar,
}: GroupSettingsProps) {
  const {
    state,
    addEmoji,
    removeEmoji,
    addSticker,
    removeSticker,
    saveRole,
    deleteRole,
    reorderRoles,
    createCategory,
    renameCategory,
    deleteCategory,
    moveCategory,
  } = useChatContext();
  const self = state.users[state.selfId];
  const allowed = visibleSections(group, self);
  const groups = GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => allowed.has(s.id)) })).filter(
    (g) => g.sections.length > 0,
  );
  const first = groups[0]?.sections[0]?.id;
  // A section you can't see (your role changed, or it was linked to) falls back to the first you can.
  const current = section && allowed.has(section) ? section : first;
  const openReports = state.reports[group.id] ?? 0;
  const channels = Object.fromEntries(group.subgroups.map((s) => [s.id, s.name]));
  const members = state.members[group.id];

  const dm = isDm(group);
  const title = dm ? dmName(group, state.users, state.selfId) : group.name;

  let content: ReactNode = null;
  switch (current) {
    case "about":
      content = (
        <About
          group={group}
          subgroup={subgroup}
          onEditGroup={allowed.has("overview") ? () => onSection("overview") : undefined}
          onEditChannel={onEditChannel}
        />
      );
      break;
    case "notifications":
      content = <Notifications group={group} subgroup={subgroup} />;
      break;
    case "disappearing":
      content = <DisappearingSettings key={subgroup.id} subgroup={subgroup} dm={dm} />;
      break;
    case "you":
      content = <You group={group} signedIn={signedIn} onLeft={onLeft} />;
      break;
    case "overview":
      content = <GroupOverview group={group} />;
      break;
    case "categories":
      content = (
        <CategoriesSettings
          group={group}
          onCreate={(name) => createCategory(group.id, name)}
          onRename={async (from, to) => {
            const failure = await renameCategory(group.id, from, to);
            // A collapsed category stays collapsed under its new name.
            if (!failure) renameInPersistentSet(COLLAPSED_SECTIONS, `${group.id}/${from}`, `${group.id}/${to}`);
            return failure;
          }}
          onDelete={(name) => deleteCategory(group.id, name)}
          onMove={(name, before) => moveCategory(group.id, name, before)}
        />
      );
      break;
    case "words":
      content = <BlockedWordsForm key={group.id} group={group} />;
      break;
    case "emoji":
      content = (
        <EmojiSettings
          emoji={group.emoji ?? []}
          onUpload={async (file) => (await uploadFile(file, () => {}).promise).url}
          onAdd={(name, url) => addEmoji(group.id, name, url)}
          onRemove={(name) => removeEmoji(group.id, name)}
        />
      );
      break;
    case "stickers":
      content = (
        <EmojiSettings
          kind="sticker"
          emoji={group.stickers ?? []}
          onUpload={async (file) => (await uploadFile(file, () => {}).promise).url}
          onAdd={(name, url) => addSticker(group.id, name, url)}
          onRemove={(name) => removeSticker(group.id, name)}
        />
      );
      break;
    case "bots":
      content = <BotManager key={group.id} groupId={group.id} heading={false} />;
      break;
    case "roles":
      content = (
        <RolesSettings
          roles={group.roles ?? []}
          onSave={(draft, id) => saveRole(group.id, draft, id)}
          onDelete={(id) => deleteRole(group.id, id)}
          onReorder={(order) => reorderRoles(group.id, order)}
        />
      );
      break;
    case "invites":
      content = (
        <InvitePanel
          users={users}
          members={members ?? []}
          onInvite={actions.invite}
          onRevoke={actions.revokeInvite}
          onLoadInvites={actions.loadInvites}
          onCreateLink={actions.createInviteLink}
          onLoadLinks={actions.loadInviteLinks}
          onRevokeLink={actions.revokeInviteLink}
        />
      );
      break;
    case "bans":
      content = <BanList key={group.id} users={users} onLoad={actions.loadBans} onUnban={actions.unban} />;
      break;
    case "reports":
      content = (
        <ReportList
          key={group.id}
          users={users}
          channels={channels}
          onLoad={actions.loadReports}
          onResolve={actions.resolveReport}
        />
      );
      break;
    case "log":
      content = <LogList key={group.id} users={users} channels={channels} onLoad={actions.loadModerationLog} />;
      break;
    case "danger":
      content = <DeleteGroup group={group} onDeleted={onDeleted} />;
      break;
  }

  // The open reports' count beside Reports; the danger zone in the danger color.
  const shownGroups = groups.map((g) => ({
    ...g,
    sections: g.sections.map((s) => ({
      ...s,
      ...(s.id === "reports" && openReports > 0 && { badge: <SectionBadge count={openReports} label="open" /> }),
      ...(s.id === "danger" && { danger: true }),
    })),
  }));

  return (
    <SettingsLayout
      title={dm ? "Conversation settings" : "Group settings"}
      subtitle={title}
      leading={!dm && <Avatar name={group.name} color={group.color} shape="square" size="sm" />}
      groups={shownGroups}
      current={current}
      onSection={onSection}
      onClose={onClose}
      onOpenSidebar={onOpenSidebar}
    >
      {content}
    </SettingsLayout>
  );
}
