"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import CallWindow, { IncomingCall } from "@/components/chat/Call";
import Browse from "@/components/chat/Container/Browse";
import Chat, { jumpTo, type MessageActions } from "@/components/chat/Container/Chat";
import NotifyMenu from "@/components/chat/Container/Chat/NotifyMenu";
import Saved from "@/components/chat/Container/Saved";
import Search from "@/components/chat/Container/Search";
import Thread from "@/components/chat/Container/Thread";
import Users, { type MemberActions } from "@/components/chat/Container/Users";
import Discover from "@/components/chat/Discover";
import GroupList from "@/components/chat/GroupList";
import Join from "@/components/chat/Join";
import GroupSettings from "@/components/chat/GroupSettings";
import ManageDialog, { type GroupSettingsSection, type ManageTarget } from "@/components/chat/Manage";
import NewDmDialog from "@/components/chat/NewDm";
import type { ProfileDraft } from "@/components/chat/Profile";
import { STATUS_LABELS } from "@/components/chat/Status";
import { authorName, summarize } from "@/lib/chat/format";
import { saveIdentity, useIdentity } from "@/lib/chat/identity";
import { profileFromUser, type PhotoChoice } from "@/lib/chat/profile";
import AdminDialog from "@/components/chat/Admin";
import Reminders from "@/components/chat/Reminders";
import SettingsScreen, { type SettingsSectionId } from "@/components/chat/Settings";
import { withGroupProfiles } from "@/lib/chat/profile";
import {
  canAnnounce,
  canManageGroup,
  canManageMessages,
  canPin,
  dmName,
  groupRole,
  isDm,
  isMine,
  isOnline,
  notificationLevel,
  roleOf,
  type Message,
  type Notify,
  type NotifyReason,
  type User as UserType,
} from "@/lib/chat/types";
import { ChatProvider, useChatContext } from "@/components/chat/Core/ChatContext";
import InviteJoin from "@/components/chat/InviteJoin";
import { captureInvite, clearInvite, pendingInvite } from "@/lib/chat/invites";
import { registerServiceWorker, syncPushSubscription } from "@/lib/chat/push";
import type { ChatIdentity } from "@/lib/chat/useChat";

/** A message to open from a notification. */
type NotificationTarget = { subgroupId: string; messageId?: string; threadId?: string };
import {
  getAccessToken,
  signOut as supabaseSignOut,
  updateProfile,
  useSession,
} from "@/lib/supabase/useSession";

export default function Core() {
  const guest = useIdentity();
  const session = useSession();
  // On every page (the sign-in screen too): the service worker makes the app
  // installable, and an invite link's code is kept until the chat connects.
  useEffect(() => {
    captureInvite();
    void registerServiceWorker();
  }, []);
  // Guest identity lives in localStorage and the session loads in the browser,
  // so there's nothing to render on the server.
  if (guest === undefined || session === undefined) return <div className="h-dvh" />;

  if (session) {
    const profile = profileFromUser(session.user);
    const identity: ChatIdentity = {
      id: session.user.id,
      name: profile.name,
      color: profile.color,
      avatarUrl: profile.avatarUrl,
      getAccessToken,
    };
    const account = { email: session.user.email, providerAvatar: profile.providerAvatar, photo: profile.photo };
    return (
      <ChatProvider key={identity.id} identity={identity}>
        <ChatApp account={account} onSaveProfile={updateProfile} onSignOut={supabaseSignOut} />
      </ChatProvider>
    );
  }
  if (guest) {
    return (
      <ChatProvider key={guest.id} identity={guest}>
        <ChatApp
          onSaveProfile={async ({ name, color, photo, bio }) => {
            const avatarUrl = photo === "none" || photo === "default" ? undefined : photo;
            saveIdentity({ ...guest, name, color, avatarUrl, bio: bio || undefined });
          }}
          onSignOut={() => saveIdentity(null)}
        />
      </ChatProvider>
    );
  }
  return <Join />;
}

type ChatAppProps = {
  /** Signed-in users only. */
  account?: { email?: string; providerAvatar?: string; photo: PhotoChoice };
  onSaveProfile: (draft: ProfileDraft) => Promise<void>;
  onSignOut: () => void;
};

function ChatApp({ account, onSaveProfile, onSignOut }: ChatAppProps) {
  const {
    state,
    select,
    rejoin,
    editMessage,
    editEvent,
    deleteMessage,
    react,
    vote,
    pin,
    setViewing,
    joinGroup,
    leaveGroup,
    inviteMember,
    uninvite,
    loadInvites,
    setMemberRole,
    muteMember,
    kickMember,
    banMember,
    transferOwnership,
    unbanMember,
    setGroupProfile,
    loadBans,
    loadModerationLog,
    dismissReminder,
    setNotificationLevel,
    openDm,
    reportMessage,
    loadReports,
    resolveReport,
    createInviteLink,
    loadInviteLinks,
    revokeInviteLink,
    previewInvite,
    redeemInvite,
    subscribePush,
    rsvp,
    forwardMessage,
    answerQuiz,
    setSaved,
    markUnread,
  } = useChatContext();
  const [manage, setManage] = useState<ManageTarget>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const activeGroup = state.groups.find((g) => g.subgroups.some((s) => s.id === state.activeId));
  const activeGroupId = activeGroup?.id ?? "";
  const activeIsDm = activeGroup?.kind === "dm";
  const activeMembers = state.members[activeGroupId];
  const selfUser = state.users[state.selfId];
  const blocked = useMemo(() => new Set(state.blocked), [state.blocked]);
  const saved = useMemo(() => new Set(state.saved), [state.saved]);
  const activeGroupEmoji = activeGroup?.emoji;
  const activeEmoji = useMemo(
    () => (activeGroupEmoji?.length ? Object.fromEntries(activeGroupEmoji.map((e) => [e.name, e.url])) : undefined),
    [activeGroupEmoji],
  );
  // Inside the open group, names and photos come from members' group profiles.
  const groupUsers = useMemo(() => withGroupProfiles(state.users, activeMembers), [state.users, activeMembers]);
  const actions = useMemo<MessageActions>(() => {
    const selfRole = roleOf(activeMembers, selfUser, activeIsDm);
    return {
      edit: editMessage,
      editEvent,
      remove: deleteMessage,
      react,
      vote,
      pin,
      canRemove: (authorId) => {
        if (!selfRole) return false;
        const author = state.users[authorId];
        // Authors whose account is gone count as plain members, as on the server.
        const authorRole = author ? (roleOf(activeMembers, author, activeIsDm) ?? "member") : "member";
        return canManageMessages(selfRole, authorRole);
      },
      // Nobody moderates direct messages, so there's no one to report to there.
      ...(!activeIsDm && { report: reportMessage }),
      isBlocked: (authorId) => blocked.has(authorId),
      rsvp,
      forward: forwardMessage,
      answerQuiz,
      save: setSaved,
      isSaved: (id) => saved.has(id),
      markUnread,
      ...(activeEmoji && { emoji: activeEmoji }),
    };
  }, [
    rsvp,
    forwardMessage,
    answerQuiz,
    setSaved,
    saved,
    markUnread,
    activeEmoji,
    editMessage,
    editEvent,
    deleteMessage,
    react,
    vote,
    pin,
    reportMessage,
    blocked,
    activeMembers,
    selfUser,
    state.users,
    activeIsDm,
  ]);
  const memberActions = useMemo<MemberActions>(
    () => ({
      join: () => joinGroup(activeGroupId),
      leave: () => leaveGroup(activeGroupId),
      invite: (userId) => inviteMember(activeGroupId, userId),
      revokeInvite: (userId) => uninvite(activeGroupId, userId),
      loadInvites: () => loadInvites(activeGroupId),
      setRole: (userId, role) => setMemberRole(activeGroupId, userId, role),
      mute: (userId, until) => muteMember(activeGroupId, userId, until),
      kick: (userId) => kickMember(activeGroupId, userId),
      ban: (userId, options) => banMember(activeGroupId, userId, options),
      transfer: (userId) => transferOwnership(activeGroupId, userId),
      unban: (userId) => unbanMember(activeGroupId, userId),
      loadBans: () => loadBans(activeGroupId),
      loadModerationLog: (before) => loadModerationLog(activeGroupId, before),
      loadReports: () => loadReports(activeGroupId),
      resolveReport,
      createInviteLink: (options) => createInviteLink(activeGroupId, options),
      loadInviteLinks: () => loadInviteLinks(activeGroupId),
      revokeInviteLink,
      setProfile: (profile) => setGroupProfile(activeGroupId, profile),
    }),
    [
      activeGroupId,
      unbanMember,
      loadBans,
      loadModerationLog,
      loadReports,
      resolveReport,
      createInviteLink,
      loadInviteLinks,
      revokeInviteLink,
      setGroupProfile,
      joinGroup,
      leaveGroup,
      inviteMember,
      uninvite,
      loadInvites,
      setMemberRole,
      muteMember,
      kickMember,
      banMember,
      transferOwnership,
    ],
  );
  // The thread open beside a channel; hidden (not closed) while another channel is shown.
  const [thread, setThread] = useState<{ subgroupId: string; id: string } | null>(null);
  // The group whose browse panel is open; it shares the side with threads and members.
  const [browsing, setBrowsing] = useState<string | null>(null);
  // A message picked in the browse panel from another channel: jumped to once that channel's history is in.
  const pendingJump = useRef<{ subgroupId: string; id: string } | null>(null);
  // The discover page shows in place of the open channel.
  const [discovering, setDiscovering] = useState(false);
  // A group's settings screen shows in place of its chat (that group is the open one meanwhile).
  const [groupSettings, setGroupSettings] = useState<{ groupId: string; section?: GroupSettingsSection } | null>(null);
  // Your settings screen, in place of the chat; it and a group's settings close each other.
  const [userSettings, setUserSettings] = useState<{ section?: SettingsSectionId } | null>(null);
  /** Leave either settings screen (going to a chat, Discover, a message…). */
  const leaveSettings = () => {
    setGroupSettings(null);
    setUserSettings(null);
  };
  // Looking at a channel counts you as online in its group (on the discover page), even without joining.
  const viewingId = discovering || !state.visible ? null : state.activeId;
  const ready = state.status === "ready";
  useEffect(() => {
    if (ready) setViewing(viewingId);
  }, [ready, viewingId, setViewing]);
  // The search panel; it shares the side with threads, the browse panel and members.
  const [searching, setSearching] = useState(false);
  // Your saved messages; they share the side the same way.
  const [savedPanel, setSavedPanel] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);

  // Desktop notifications for what the server says you'd want to hear about,
  // while you're not looking at the app (and not in Do not disturb).
  /** Open a notified message: its thread, or its place in its channel. */
  const goToMessage = useEffectEvent(({ subgroupId, messageId, threadId }: NotificationTarget) => {
    setDiscovering(false);
    leaveSettings();
    select(subgroupId);
    if (threadId) setThread({ subgroupId, id: threadId });
    else if (messageId) pendingJump.current = { subgroupId, id: messageId };
  });

  const showNotification = useEffectEvent(({ message, reason, groupId }: Notify) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (state.presence === "dnd" || (document.visibilityState === "visible" && document.hasFocus())) return;
    const home = state.groups.find((g) => g.id === groupId);
    if (!home) return;
    const author = state.users[message.authorId];
    const where = isDm(home)
      ? dmName(home, state.users, state.selfId)
      : `#${home.subgroups.find((s) => s.id === message.subgroupId)?.name ?? "channel"}`;
    const oneOnOne = isDm(home) && (home.members?.length ?? 0) <= 2;
    try {
      const notification = new Notification(notifyTitle(reason, authorName(author, message.authorId), where, oneOnOne), {
        body: summarize(message).slice(0, 200),
        tag: `message-${message.id}`,
        icon: author?.avatarUrl,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
        goToMessage({ subgroupId: message.subgroupId, messageId: message.id, threadId: message.threadId });
      };
    } catch {
      // Some browsers (e.g. Android Chrome) only allow notifications from a service worker.
    }
  });

  // Push notifications clicked while the app was closed open it at "/?open=…"; while
  // it's open, the service worker posts the same here instead.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    const subgroupId = url.searchParams.get("open");
    if (subgroupId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- once, when the connection is first ready (like the clicks below)
      goToMessage({
        subgroupId,
        messageId: url.searchParams.get("message") ?? undefined,
        threadId: url.searchParams.get("thread") ?? undefined,
      });
      for (const key of ["open", "message", "thread"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url);
    }
    const worker = navigator.serviceWorker;
    if (!worker) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as ({ type?: string } & Partial<NotificationTarget>) | null;
      if (data?.type === "obsidian:open" && typeof data.subgroupId === "string") {
        goToMessage({ subgroupId: data.subgroupId, messageId: data.messageId, threadId: data.threadId });
      }
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, [ready]);

  // Each connection: re-send this browser's push subscription, so it follows whoever is signed in here.
  const signedInNow = Boolean(account);
  useEffect(() => {
    if (ready && signedInNow) void syncPushSubscription(subscribePush);
  }, [ready, signedInNow, subscribePush]);

  // An invite link opened this tab (maybe before signing in; Core kept its code): offered once connected.
  const [inviteCode, setInviteCode] = useState(pendingInvite);
  const closeInvite = () => {
    clearInvite();
    setInviteCode(null);
  };
  const lastNotify = state.lastNotify;
  useEffect(() => {
    if (lastNotify) showNotification(lastNotify.notify);
  }, [lastNotify]);

  // Unread total in the tab title, so it shows up in the browser tab bar (your groups only;
  // channels with notifications off only count what's addressed to you).
  const totalUnread = state.groups
    .filter(isMine)
    .flatMap((g) =>
      g.subgroups.map((s) =>
        notificationLevel(state.notifications, g, s.id) === "none"
          ? (state.mentions[s.id] ?? 0)
          : Math.max(state.unread[s.id] ?? 0, state.mentions[s.id] ?? 0),
      ),
    )
    .reduce((sum, n) => sum + n, 0);
  const instanceName = state.settings.name;
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? "99+" : totalUnread}) ${instanceName}` : instanceName;
  }, [totalUnread, instanceName]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(true);
  // Below the lg breakpoint the members panel is a drawer, closed by default.
  const [membersDrawer, setMembersDrawer] = useState(false);
  const { activeId } = state;
  const activeMessages = activeId ? state.messages[activeId] : undefined;
  useEffect(() => {
    const target = pendingJump.current;
    if (!target || target.subgroupId !== activeId || !activeMessages) return;
    pendingJump.current = null;
    // Older than the latest page: the channel is open, which is as close as we get.
    if (activeMessages.some((m) => m.id === target.id)) requestAnimationFrame(() => jumpTo(target.id));
  }, [activeId, activeMessages]);

  if (state.status === "error") {
    return (
      <Notice title="Couldn't join the chat" body={state.error ?? undefined}>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Sign out and try again
        </button>
      </Notice>
    );
  }

  const group = state.groups.find((g) => g.subgroups.some((s) => s.id === state.activeId));
  const subgroup = group?.subgroups.find((s) => s.id === state.activeId);
  // Nothing to show before the first snapshot. After it, no open channel means
  // you're in no groups yet, and Discover shows instead.
  if (!subgroup && state.groups.length === 0 && state.status !== "ready") {
    return (
      <Notice
        title="Connecting…"
        body={state.status === "offline" ? "Can't reach the chat server. Retrying…" : undefined}
      />
    );
  }

  const self = state.users[state.selfId];
  const typingNames = (subgroup ? (state.typing[subgroup.id] ?? []) : [])
    .map((id) => groupUsers[id]?.name)
    .filter((name): name is string => Boolean(name));
  const signedIn = Boolean(account);
  // Your role in the open group decides announcements and pins (guests can't pin).
  const selfRole = group ? groupRole(group, self) : undefined;
  const mayPin = signedIn && Boolean(group) && canPin(selfRole, Boolean(group && isDm(group)));
  const messages = subgroup && state.messages[subgroup.id];
  const members = group && state.members[group.id];
  // This chat's members who are online (their live presence, not the list's snapshot).
  const onlineCount = (members ?? []).filter((m) => isOnline(state.users[m.user.id] ?? m.user)).length;
  const mutedUntil = members?.find((m) => m.user.id === state.selfId)?.mutedUntil;
  const threadId = subgroup && thread?.subgroupId === subgroup.id ? thread.id : undefined;
  const browseOpen = group !== undefined && browsing === group.id && !threadId;
  const searchOpen = searching && !threadId && !browseOpen;
  const savedOpen = savedPanel && !threadId && !browseOpen && !searchOpen;
  // Direct messages are shown by who's in them.
  const dmOthers = group && isDm(group) ? (group.members ?? []).filter((id) => id !== state.selfId) : undefined;
  const direct =
    group && dmOthers
      ? { title: dmName(group, state.users, state.selfId), subtitle: dmSubtitle(dmOthers, state.users) }
      : undefined;
  /** Open (or start) the direct message with these people. Resolves to an error message. */
  const openDmWith = async (userIds: string[]) => {
    const result = await openDm(userIds);
    if (!result.ok) return result.error;
    setDiscovering(false);
    setSidebarOpen(false);
    setMembersDrawer(false);
    select(result.subgroupId);
  };
  // Show the root from the channel list right away; the thread fetch fills it in otherwise.
  const threadRoot = threadId
    ? (messages?.find((m) => m.id === threadId) ?? state.references[threadId])
    : undefined;
  const showDiscover = discovering || !subgroup;

  /**
   * Open a group's settings screen (at `section`) in place of its chat. The
   * group becomes the open one, so the member actions are bound to it.
   */
  const openGroupSettings = (groupId: string, section?: GroupSettingsSection) => {
    const first = state.groups.find((g) => g.id === groupId)?.subgroups[0];
    if (!first) return;
    if (group?.id !== groupId) select(first.id);
    setDiscovering(false);
    setSidebarOpen(false);
    setMembersDrawer(false);
    setUserSettings(null);
    setGroupSettings({ groupId, section });
  };
  const openUserSettings = (section?: SettingsSectionId) => {
    setGroupSettings(null);
    setSidebarOpen(false);
    setUserSettings({ section });
  };
  // Only while that group is still the open one (and still exists).
  const settingsGroup = groupSettings && group?.id === groupSettings.groupId ? group : undefined;

  /** Go to a message: its thread, or its place in its channel. */
  const openMessage = (message: Message) => {
    setDiscovering(false);
    if (message.subgroupId !== subgroup?.id) select(message.subgroupId);
    // A thread takes the side; the browse panel comes back when it's closed.
    if (message.threadId) {
      setThread({ subgroupId: message.subgroupId, id: message.threadId });
      return;
    }
    if (message.subgroupId === subgroup?.id) requestAnimationFrame(() => jumpTo(message.id));
    else pendingJump.current = { subgroupId: message.subgroupId, id: message.id };
  };

  return (
    <div className="flex h-dvh overflow-hidden text-foreground">
      <GroupList
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => {
          select(id);
          setDiscovering(false);
          leaveSettings();
          setSidebarOpen(false);
        }}
        discovering={showDiscover && !settingsGroup && !userSettings}
        onDiscover={() => {
          setDiscovering(true);
          leaveSettings();
          setSidebarOpen(false);
        }}
        onSignOut={onSignOut}
        onEditProfile={() => openUserSettings("profile")}
        onManage={(target) =>
          target.kind === "settings" ? openGroupSettings(target.groupId, target.section) : setManage(target)
        }
        canCreateGroup={signedIn}
        onOpenAdmin={self?.role === "admin" ? () => setAdminOpen(true) : undefined}
        onNewDm={signedIn ? () => setNewDmOpen(true) : undefined}
        onSetStatus={() => openUserSettings("status")}
        onOpenSettings={() => openUserSettings()}
      />
      {userSettings ? (
        <SettingsScreen
          section={userSettings.section}
          onSection={(section) => setUserSettings({ section })}
          onClose={() => setUserSettings(null)}
          onOpenSidebar={() => setSidebarOpen(true)}
          signedIn={signedIn}
          account={account}
          onSaveProfile={async (draft) => {
            await onSaveProfile(draft);
            // Guests re-join automatically when their identity changes.
            if (account) rejoin();
          }}
          onSignOut={onSignOut}
        />
      ) : settingsGroup ? (
        <GroupSettings
          key={settingsGroup.id}
          group={settingsGroup}
          subgroup={subgroup ?? settingsGroup.subgroups[0]}
          signedIn={signedIn}
          users={groupUsers}
          actions={memberActions}
          section={groupSettings?.section}
          onSection={(section) => setGroupSettings({ groupId: settingsGroup.id, section })}
          onClose={() => setGroupSettings(null)}
          onDeleted={() => {
            setGroupSettings(null);
            setDiscovering(true);
          }}
          onLeft={() => setGroupSettings(null)}
          onEditChannel={
            canManageGroup(settingsGroup, self) && subgroup
              ? () => setManage({ kind: "channel", groupId: settingsGroup.id, channel: subgroup })
              : undefined
          }
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      ) : discovering || !group || !subgroup ? (
        <Discover
          onOpenGroup={(groupId) => {
            const first = state.groups.find((g) => g.id === groupId)?.subgroups[0];
            if (!first) return;
            select(first.id);
            setDiscovering(false);
          }}
          onOpenEvent={openMessage}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      ) : (
        <>
          <Chat
            group={group}
            subgroup={subgroup}
            users={groupUsers}
            notice={
              state.stopping === "restart"
                ? "The server is restarting. You'll reconnect automatically in a moment."
                : state.stopping === "shutdown"
                  ? "An admin is shutting the server down."
                  : state.settings.notice
            }
            typingNames={typingNames}
            usersOpen={usersOpen && !threadId && !browseOpen && !searchOpen && !savedOpen}
            onlineCount={onlineCount}
            signedIn={signedIn}
            canAnnounce={canAnnounce(selfRole, self)}
            canPin={mayPin}
            mutedUntil={mutedUntil}
            openThreadId={threadId}
            actions={actions}
            onOpenSidebar={() => setSidebarOpen(true)}
            onToggleUsers={() => {
              // Same breakpoint as the panel's `lg:` classes (64rem).
              if (!window.matchMedia("(min-width: 64rem)").matches) {
                setMembersDrawer(true);
                return;
              }
              // Members, a thread, the browse panel, search and saved messages share the side: showing members closes the others.
              if (threadId || browseOpen || searchOpen || savedOpen) {
                setThread(null);
                setBrowsing(null);
                setSearching(false);
                setSavedPanel(false);
                setUsersOpen(true);
              } else {
                setUsersOpen((open) => !open);
              }
            }}
            onOpenThread={(message) => setThread({ subgroupId: subgroup.id, id: message.id })}
            browsing={browseOpen}
            onBrowse={() => {
              setThread(null);
              setSearching(false);
              setSavedPanel(false);
              setBrowsing(browseOpen ? null : group.id);
            }}
            searching={searchOpen}
            onSearch={() => {
              setThread(null);
              setBrowsing(null);
              setSavedPanel(false);
              setSearching(!searchOpen);
            }}
            savedOpen={savedOpen}
            onSaved={() => {
              setThread(null);
              setBrowsing(null);
              setSearching(false);
              setSavedPanel(!savedOpen);
            }}
            direct={direct}
            notifyMenu={
              <NotifyMenu
                dm={Boolean(direct)}
                channelName={subgroup.name}
                groupName={group.name}
                channelLevel={state.notifications[subgroup.id]}
                groupLevel={state.notifications[group.id]}
                effective={notificationLevel(state.notifications, group, subgroup.id)}
                onSetChannel={(level) => setNotificationLevel(subgroup.id, level, state.notifications[subgroup.id] ?? null)}
                onSetGroup={(level) => setNotificationLevel(group.id, level, state.notifications[group.id] ?? null)}
              />
            }
            onOpenSettings={() => openGroupSettings(group.id, "about")}
            onJoin={group.role ? undefined : () => joinGroup(group.id)}
          />
          {threadId ? (
            <Thread
              key={threadId}
              subgroup={subgroup}
              rootId={threadId}
              root={threadRoot}
              users={groupUsers}
              actions={actions}
              signedIn={signedIn}
              canPin={mayPin}
              groupName={direct?.title ?? group.name}
              place={direct?.title}
              mutedUntil={mutedUntil}
              onClose={() => setThread(null)}
            />
          ) : browseOpen ? (
            <Browse
              key={group.id}
              group={group}
              activeId={subgroup.id}
              users={groupUsers}
              actions={actions}
              onOpen={(message) => {
                // On small screens the panel covers the chat; close it to show the message.
                if (!message.threadId && !window.matchMedia("(min-width: 64rem)").matches) setBrowsing(null);
                openMessage(message);
              }}
              onClose={() => setBrowsing(null)}
            />
          ) : searchOpen ? (
            <Search
              group={group}
              subgroup={subgroup}
              onOpen={(message) => {
                // On small screens the panel covers the chat; close it to show the message.
                if (!message.threadId && !window.matchMedia("(min-width: 64rem)").matches) setSearching(false);
                openMessage(message);
              }}
              onClose={() => setSearching(false)}
            />
          ) : savedOpen ? (
            <Saved
              onOpen={(message) => {
                // On small screens the panel covers the chat; close it to show the message.
                if (!message.threadId && !window.matchMedia("(min-width: 64rem)").matches) setSavedPanel(false);
                openMessage(message);
              }}
              onClose={() => setSavedPanel(false)}
            />
          ) : (
            usersOpen && (
              <Users
                users={groupUsers}
                group={group}
                actions={memberActions}
                canUpload={signedIn}
                onMessage={signedIn ? (userId) => openDmWith([userId]) : undefined}
                onOpenSettings={(section) => openGroupSettings(group.id, section)}
                className="hidden lg:flex"
              />
            )
          )}
          {membersDrawer && (
            <Users
              users={groupUsers}
              group={group}
              actions={memberActions}
              canUpload={signedIn}
              onMessage={signedIn ? (userId) => openDmWith([userId]) : undefined}
              onOpenSettings={(section) => openGroupSettings(group.id, section)}
              onClose={() => setMembersDrawer(false)}
              className="lg:hidden"
            />
          )}
        </>
      )}
      <CallWindow />
      <IncomingCall />
      {inviteCode && ready && (
        <InviteJoin
          code={inviteCode}
          onPreview={previewInvite}
          onRedeem={redeemInvite}
          onJoined={(subgroupId) => {
            closeInvite();
            if (!subgroupId) return;
            setDiscovering(false);
            leaveSettings();
            setSidebarOpen(false);
            select(subgroupId);
          }}
          onClose={closeInvite}
        />
      )}
      <Reminders
        onOpen={(reminder) => {
          select(reminder.subgroupId);
          leaveSettings();
          setDiscovering(false);
          dismissReminder(reminder.messageId);
        }}
      />
      {self?.role === "admin" && <AdminDialog open={adminOpen} onClose={() => setAdminOpen(false)} />}
      <ManageDialog
        target={manage}
        onClose={() => setManage(null)}
        onCreated={(channelId) => {
          select(channelId);
          setDiscovering(false);
          setSidebarOpen(false);
        }}
      />
      {signedIn && <NewDmDialog open={newDmOpen} onStart={openDmWith} onClose={() => setNewDmOpen(false)} />}
    </div>
  );
}

/** A desktop notification's title, by why you're getting it. */
function notifyTitle(reason: NotifyReason, author: string, where: string, oneOnOne: boolean) {
  switch (reason) {
    case "mention":
      return `${author} mentioned you in ${where}`;
    case "reply":
      return `${author} replied to you in ${where}`;
    case "thread":
      return `${author} replied in a thread in ${where}`;
    case "dm":
      return oneOnOne ? author : `${author} in ${where}`;
    default:
      return `${author} in ${where}`;
  }
}

/** Under a direct message's title: the other person's custom status or presence, or how many are in it. */
function dmSubtitle(others: string[], users: Record<string, UserType>) {
  if (others.length !== 1) return `${others.length + 1} people`;
  const other = users[others[0]];
  if (!other) return "Direct message";
  if (other.statusEmoji || other.statusText) return [other.statusEmoji, other.statusText].filter(Boolean).join(" ");
  return STATUS_LABELS[other.status];
}

function Notice({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <h1 role="status" className="text-lg font-semibold">
        {title}
      </h1>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {children}
    </main>
  );
}
