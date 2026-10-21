"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ban, Bell, Eye, KeyRound, LogOut, MessagesSquare, Monitor, Moon, Palette, Phone, Smile, Sun, UserRound } from "lucide-react";
import Field from "@/components/form/Field";
import { LOCALE_NAMES, LOCALES, useT, type MessageKey } from "@/lib/i18n";
import { isLocale, resolveLocale } from "@/lib/i18n/locales";
import Radio from "@/components/form/Radio";
import Select from "@/components/form/Select";
import Switch from "@/components/form/Switch";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { ProfileForm, type ProfileDraft } from "@/components/chat/Profile";
import { PasswordForm } from "@/components/chat/Password";
import SettingsLayout, { type SettingsGroup } from "@/components/chat/SettingsLayout";
import { CustomStatus, PRESENCE_LABELS, StatusForm } from "@/components/chat/Status";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import type { PhotoChoice } from "@/lib/chat/profile";
import { usePush } from "@/lib/chat/push";
import { ACCENTS, type Clock, type Density, type TextSize, type Theme } from "@/lib/chat/appearance";
import { updateSettings, useSettings } from "@/lib/chat/settings";
import { canLeave, dmName, isDm, type Group, type MemberRole, type NotificationLevel, type User } from "@/lib/chat/types";

export type SettingsSectionId = "profile" | "status" | "appearance" | "notifications" | "calls" | "chats" | "privacy" | "blocked" | "account";

/** Every section under its heading; labels, descriptions and headings are message keys (see lib/i18n). */
const GROUPS: SettingsGroup<SettingsSectionId>[] = [
  {
    heading: "settings.group.you",
    sections: [
      { id: "profile", label: "settings.profile", description: "settings.profile.description", icon: UserRound },
      { id: "status", label: "settings.status", description: "settings.status.description", icon: Smile },
    ],
  },
  {
    heading: "settings.group.preferences",
    sections: [
      { id: "appearance", label: "settings.appearance", description: "settings.appearance.description", icon: Palette },
      { id: "notifications", label: "settings.notifications", description: "settings.notifications.description", icon: Bell },
      { id: "calls", label: "settings.calls", description: "settings.calls.description", icon: Phone },
    ],
  },
  {
    heading: "settings.group.chats",
    sections: [
      { id: "chats", label: "settings.chats", description: "settings.chats.description", icon: MessagesSquare },
    ],
  },
  {
    heading: "settings.group.privacy",
    sections: [
      { id: "privacy", label: "settings.privacy", description: "settings.privacy.description", icon: Eye },
      { id: "blocked", label: "settings.blocked", description: "settings.blocked.description", icon: Ban },
    ],
  },
  {
    // Set apart by a line, rather than titled with its own name again.
    heading: "",
    sections: [
      { id: "account", label: "settings.account", description: "settings.account.description", icon: KeyRound },
    ],
  },
];

type SettingsScreenProps = {
  section?: SettingsSectionId;
  onSection: (section: SettingsSectionId) => void;
  /** Back to the chat. */
  onClose: () => void;
  onOpenSidebar: () => void;
  /** Signed-in users (guests can't hide DMs or pick a photo; they have none). */
  signedIn: boolean;
  /** Present for signed-in users. */
  account?: { email?: string; provider?: string; providerAvatar?: string; photo: PhotoChoice };
  onSaveProfile: (draft: ProfileDraft) => Promise<void>;
  onSignOut: () => void;
};

/**
 * Your settings, as a screen in place of the chat: your profile and status,
 * notifications and calls, your groups, privacy and safety, and your account.
 */
export default function SettingsScreen({
  section,
  onSection,
  onClose,
  onOpenSidebar,
  signedIn,
  account,
  onSaveProfile,
  onSignOut,
}: SettingsScreenProps) {
  const { state } = useChatContext();
  const t = useT();
  const self: User | undefined = state.users[state.selfId];
  const current = section ?? "profile";
  const groups = GROUPS.map((group) => ({
    heading: group.heading && t(group.heading as MessageKey),
    sections: group.sections.map((item) => ({
      ...item,
      label: t(item.label as MessageKey),
      description: t(item.description as MessageKey),
    })),
  }));

  let content: ReactNode = null;
  switch (current) {
    case "profile":
      content = self && <ProfileForm key={self.id} user={self} account={account} onSave={onSaveProfile} />;
      break;
    case "status":
      content = <StatusForm />;
      break;
    case "appearance":
      content = <AppearanceSettings />;
      break;
    case "notifications":
      content = <NotificationSettings signedIn={signedIn} />;
      break;
    case "calls":
      content = <CallSettings />;
      break;
    case "chats":
      content = <ChatsSettings />;
      break;
    case "privacy":
      content = <PrivacySettings signedIn={signedIn} />;
      break;
    case "blocked":
      content = <BlockedSettings />;
      break;
    case "account":
      content = (
        <div className="space-y-8">
          <AccountSettings signedIn={signedIn} email={account?.email} provider={account?.provider} onSignOut={onSignOut} />
          {signedIn && <DataSettings onDeleted={onSignOut} />}
        </div>
      );
      break;
  }

  return (
    <SettingsLayout
      title={t("settings.title")}
      subtitle={self?.name}
      leading={self && <Avatar name={self.name} color={self.color} src={self.avatarUrl} size="sm" status={self.status} />}
      groups={groups}
      current={current}
      onSection={onSection}
      onClose={onClose}
      onOpenSidebar={onOpenSidebar}
    >
      {content}
    </SettingsLayout>
  );
}

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  moderator: "Moderator",
  member: "Member",
};

function SectionNote({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-muted">{children}</p>;
}

/** The groups in your sidebar, each with Leave. */
function ChatsSettings() {
  const { state, leaveGroup } = useChatContext();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mine = state.groups.filter((g) => g.role && !isDm(g));

  async function leave(group: Group) {
    setBusy(true);
    setError(undefined);
    const failure = await leaveGroup(group.id);
    setBusy(false);
    setConfirming(null);
    if (failure) setError(failure);
  }

  return (
    <section aria-label="Your chats">
      <SectionNote>
        The groups in your sidebar. Posting in a public group joins it, so leave any you don&apos;t want here; you can
        find public ones again in Discover.
      </SectionNote>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      {mine.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">You&apos;re not in any groups.</p>
      ) : (
        <ul className="space-y-1">
          {mine.map((group) => {
            const role = group.role!;
            return (
              <li key={group.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                <Avatar name={group.name} color={group.color} shape="square" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{group.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {ROLE_LABELS[role]} · {group.visibility === "private" ? "Private" : "Public"}
                  </span>
                </span>
                {!canLeave(role) ? (
                  <span className="text-right text-xs text-muted">Transfer ownership to leave</span>
                ) : confirming === group.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="h-8 rounded-lg px-3 text-xs font-medium text-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void leave(group)}
                      className="h-8 rounded-lg bg-danger-strong px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Leave
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(group.id)}
                    aria-label={`Leave ${group.name}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface hover:text-danger"
                  >
                    <LogOut aria-hidden className="size-3.5" />
                    Leave
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const LEVEL_LABELS: Record<NotificationLevel, string> = {
  all: "All messages",
  mentions: "Mentions and replies",
  none: "Nothing",
};

/** Desktop notifications, and each chat's level. */
/** Your data: download a copy, or delete your account (signed-in users). */
function DataSettings({ onDeleted }: { onDeleted: () => void }) {
  const { deleteAccount } = useChatContext();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setBusy(true);
    setError(undefined);
    const failure = await deleteAccount();
    setBusy(false);
    if (failure) return setError(failure);
    onDeleted();
  }

  return (
    <section aria-label="Your data" className="space-y-3">
      <h3 className="text-sm font-medium">Your data</h3>
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
        <p className="min-w-0 flex-1 text-xs text-muted">
          A copy of your profile, groups, messages, reactions and settings, as a JSON file.
        </p>
        <a
          href="/api/account/export"
          download
          className="inline-flex h-8 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface"
        >
          Download
        </a>
      </div>
      <div className="space-y-2 rounded-lg border border-danger/40 px-3 py-2.5">
        <p className="text-xs text-muted">
          Deleting your account signs you out everywhere and can&apos;t be undone. Your messages stay in their chats,
          shown as from &ldquo;Unknown user&rdquo;. If you own a group, transfer it or delete it first.
        </p>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="delete-confirm" className="text-xs">
              Type <strong>delete</strong> to confirm:
            </label>
            <input
              id="delete-confirm"
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="h-8 w-28 rounded-md border border-border bg-surface px-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || typed.trim().toLowerCase() !== "delete"}
              onClick={() => void remove()}
              className="h-8 rounded-lg bg-danger-strong px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              className="h-8 rounded-lg px-3 text-xs font-medium text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-8 rounded-lg px-3 text-xs font-medium text-danger hover:bg-danger/10"
          >
            Delete account…
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/** Read receipts ("Seen by"), on or off for both directions. */
/** Read receipts, and whether people can find you (signed-in users; guests aren't listed anyway). */
function PrivacySettings({ signedIn }: { signedIn: boolean }) {
  const { state, setReadReceipts, setDiscoverable } = useChatContext();
  const t = useT();
  const [busy, setBusy] = useState<"receipts" | "discoverable" | null>(null);
  const [error, setError] = useState<{ which: "receipts" | "discoverable"; message: string }>();

  async function toggle(which: "receipts" | "discoverable", on: boolean) {
    setBusy(which);
    setError(undefined);
    const failure = await (which === "receipts" ? setReadReceipts(on) : setDiscoverable(on));
    if (failure) setError({ which, message: failure });
    setBusy(null);
  }
  const errorFor = (which: "receipts" | "discoverable") =>
    error?.which === which && (
      <p role="alert" className="text-xs text-danger">
        {error.message}
      </p>
    );

  return (
    <section aria-label={t("settings.privacy")} className="space-y-3">
      <div className="space-y-1.5 rounded-lg bg-surface-2 px-3 py-2.5">
        <Switch
          checked={state.readReceipts}
          disabled={busy !== null || state.status !== "ready"}
          onChange={(on) => void toggle("receipts", on)}
        >
          {t("privacy.readReceipts")}
        </Switch>
        <p className="text-xs text-muted">{t("privacy.readReceipts.hint")}</p>
        {errorFor("receipts")}
      </div>
      {signedIn && (
        <div className="space-y-1.5 rounded-lg bg-surface-2 px-3 py-2.5">
          <Switch
            checked={state.discoverable}
            disabled={busy !== null || state.status !== "ready"}
            onChange={(on) => void toggle("discoverable", on)}
          >
            {t("privacy.discoverable")}
          </Switch>
          <p className="text-xs text-muted">{t("privacy.discoverable.hint")}</p>
          {errorFor("discoverable")}
        </div>
      )}
    </section>
  );
}

/** People you've blocked, each with Unblock. */
function BlockedSettings() {
  const { state, setBlocked } = useChatContext();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function unblock(userId: string) {
    setPending(userId);
    setError(undefined);
    const failure = await setBlocked(userId, false);
    setPending(null);
    if (failure) setError(failure);
  }

  return (
    <section aria-label="Blocked people">
      <SectionNote>
        Their messages are hidden from you (you can still show each one), they don&apos;t notify you, and neither of you
        can message the other directly. They aren&apos;t told.
      </SectionNote>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      {state.blocked.length === 0 ? (
        <p className="text-sm text-muted">You haven&apos;t blocked anyone.</p>
      ) : (
        <ul className="space-y-1">
          {state.blocked.map((id) => {
            const user = state.users[id];
            const name = user?.name ?? "Unknown user";
            return (
              <li key={id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-1.5">
                <Avatar name={name} color={user?.color ?? "#6b7280"} src={user?.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void unblock(id)}
                  className="h-7 shrink-0 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface disabled:opacity-50"
                >
                  {pending === id ? "Unblocking…" : "Unblock"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Push to this device while no tab is open (signed-in users; guests have no account to push to). */
function PushSettings() {
  const { subscribePush, unsubscribePush } = useChatContext();
  const push = usePush(subscribePush, unsubscribePush);
  if (!push.supported) {
    return (
      <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-muted">
        This browser can&apos;t get push notifications here. On iPhone and iPad, add the app to your Home Screen first.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-lg bg-surface-2 px-3 py-2.5">
      <Switch
        checked={Boolean(push.subscribed)}
        disabled={push.busy || push.subscribed === undefined}
        onChange={(on) => void (on ? push.enable() : push.disable())}
      >
        Push notifications on this device
      </Switch>
      <p className="text-xs text-muted">
        Mentions, replies, direct messages and your threads reach this device even when the app is closed, following
        your settings below.
      </p>
      {push.error && (
        <p role="alert" className="text-xs text-danger">
          {push.error}
        </p>
      )}
    </div>
  );
}

function NotificationSettings({ signedIn }: { signedIn: boolean }) {
  const { state, setNotificationLevel } = useChatContext();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [error, setError] = useState<string>();
  const chats = state.groups.filter((g) => g.role);

  return (
    <section aria-label="Notifications" className="space-y-4">
      {signedIn && <PushSettings />}
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
        <Bell aria-hidden className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 text-sm">
          {permission === "granted"
            ? "Desktop notifications are on while this tab is in the background."
            : permission === "denied"
              ? "Desktop notifications are blocked in your browser's site settings."
              : permission === "unsupported"
                ? "This browser can't show desktop notifications."
                : "Desktop notifications are off."}
        </span>
        {permission === "default" && (
          <button
            type="button"
            onClick={() => void Notification.requestPermission().then(setPermission)}
            className="h-8 shrink-0 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground hover:opacity-90"
          >
            Turn on
          </button>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">Notify me about</h3>
        <SectionNote>Per chat. Channels can still have their own setting (from the bell in a channel).</SectionNote>
        {error && (
          <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        {chats.length === 0 && (
          <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-sm text-muted">
            You&apos;re not in any chats yet. Each one you join shows up here.
          </p>
        )}
        <ul className="space-y-1">
          {chats.map((group) => {
            const own = state.notifications[group.id] ?? null;
            const fallback: NotificationLevel = isDm(group) ? "all" : "mentions";
            const name = isDm(group) ? dmName(group, state.users, state.selfId) : group.name;
            return (
              <li key={group.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-1.5">
                <Avatar name={name} color={group.color} shape={isDm(group) ? "circle" : "square"} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                <Select
                  aria-label={`Notifications for ${name}`}
                  className="w-52 shrink-0"
                  value={own ?? "default"}
                  onChange={async (next) => {
                    setError(undefined);
                    const level = !next || next === "default" ? null : (next as NotificationLevel);
                    const failure = await setNotificationLevel(group.id, level, own);
                    if (failure) setError(failure);
                  }}
                  options={[
                    { value: "default", label: `Default (${LEVEL_LABELS[fallback]})` },
                    ...(["all", "mentions", "none"] as const).map((level) => ({ value: level, label: LEVEL_LABELS[level] })),
                  ]}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const canPickSpeaker = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

/** Microphone, camera and speaker for calls, with a camera preview, and the ringtone. */
function CallSettings() {
  const settings = useSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string>();
  const [previewing, setPreviewing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setDevices(await navigator.mediaDevices.enumerateDevices());
  }, []);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    let active = true;
    void media.enumerateDevices().then((list) => {
      if (active) setDevices(list);
    });
    const onChange = () => void refresh();
    media.addEventListener("devicechange", onChange);
    return () => {
      active = false;
      media.removeEventListener("devicechange", onChange);
    };
  }, [refresh]);

  // The chosen camera, while previewing.
  useEffect(() => {
    if (!previewing) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ video: settings.cameraId ? { deviceId: { exact: settings.cameraId } } : true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError("Couldn't open that camera."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [previewing, settings.cameraId]);

  // Device names stay hidden until the page has been allowed to use them once.
  const labelled = devices.some((d) => d.label);
  async function allow() {
    setError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Your browser didn't allow it. Check the site's permissions.");
    }
    await refresh();
  }

  const options = (kind: MediaDeviceKind, fallback: string) => [
    { value: "default", label: `System default` },
    ...devices
      .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== "default")
      .map((d, index) => ({ value: d.deviceId, label: d.label || `${fallback} ${index + 1}` })),
  ];
  const pick = (key: "micId" | "cameraId" | "speakerId") => (value: string | null) =>
    updateSettings({ [key]: !value || value === "default" ? null : value });

  return (
    <section aria-label="Calls" className="space-y-4">
      {!labelled && (
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">Allow microphone and camera access to see your devices by name.</span>
          <button
            type="button"
            onClick={() => void allow()}
            className="h-8 shrink-0 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground hover:opacity-90"
          >
            Allow
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Microphone" htmlFor="settings-mic">
          <Select id="settings-mic" value={settings.micId ?? "default"} onChange={pick("micId")} options={options("audioinput", "Microphone")} />
        </Field>
        <Field label="Camera" htmlFor="settings-camera">
          <Select
            id="settings-camera"
            value={settings.cameraId ?? "default"}
            onChange={pick("cameraId")}
            options={options("videoinput", "Camera")}
          />
        </Field>
        {canPickSpeaker && (
          <Field label="Speaker" htmlFor="settings-speaker" hint="Where call audio plays.">
            <Select
              id="settings-speaker"
              value={settings.speakerId ?? "default"}
              onChange={pick("speakerId")}
              options={options("audiooutput", "Speaker")}
            />
          </Field>
        )}
      </div>

      <div className="space-y-2">
        <Switch checked={previewing} onChange={setPreviewing}>
          Preview camera
        </Switch>
        {previewing && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Camera preview"
            className="aspect-video w-full max-w-sm -scale-x-100 rounded-xl bg-black/40 object-cover ring-1 ring-border"
          />
        )}
      </div>

      <Switch
        checked={settings.ringtone}
        onChange={(ringtone) => updateSettings({ ringtone })}
        description="Incoming calls always show; this is just the sound. Do not disturb silences it too."
      >
        Ring for incoming calls
      </Switch>
    </section>
  );
}

const THEMES: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "dark", label: "Dark", icon: <Moon aria-hidden className="size-4" /> },
  { value: "light", label: "Light", icon: <Sun aria-hidden className="size-4" /> },
  { value: "system", label: "Match system", icon: <Monitor aria-hidden className="size-4" /> },
];

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

const CLOCKS: { value: Clock; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
];

/** How the app looks on this device: theme, accent color, text size, message spacing and the clock. */
function AppearanceSettings() {
  const settings = useSettings();
  const t = useT();
  const languageId = useId();
  // What "Automatic" picks here, named in itself.
  const automatic = LOCALE_NAMES[resolveLocale("auto", typeof navigator === "undefined" ? [] : navigator.languages)];
  // The clock as each choice would show it, e.g. "3:42 PM" or "15:42".
  const sample = (hour12?: boolean) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12 }).format(new Date(2026, 0, 1, 15, 42));

  return (
    <section aria-label="Appearance" className="space-y-6">
      <SectionNote>Saved on this device, so each computer or phone can look its own way.</SectionNote>

      <Field label={t("settings.language")} htmlFor={languageId} hint={t("settings.language.hint")}>
        <Select
          id={languageId}
          value={settings.language}
          onChange={(next) => updateSettings({ language: next === "auto" || isLocale(next) ? next : "auto" })}
          options={[
            { value: "auto", label: t("settings.language.auto", { language: automatic }) },
            ...LOCALES.map((locale) => ({ value: locale, label: LOCALE_NAMES[locale] })),
          ]}
        />
      </Field>

      <Choice label="Theme">
        <Radio.Group type="segment" value={settings.theme} onChange={(theme) => updateSettings({ theme })} aria-label="Theme">
          {THEMES.map((option) => (
            <Radio key={option.value} value={option.value} icon={option.icon} className="px-3 py-1.5 text-sm">
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      </Choice>

      <Choice label="Accent color" hint="Buttons, links, highlights and what's selected. Each reads well in both themes.">
        <Radio.Group
          type="button"
          value={settings.accent}
          onChange={(accent) => updateSettings({ accent })}
          aria-label="Accent color"
          className="flex-wrap gap-1.5"
        >
          {ACCENTS.map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              icon={
                <span
                  aria-hidden
                  className="size-4 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
              }
              className="px-3 py-1.5 text-sm"
            >
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      </Choice>

      <Choice label="Text size" hint="Scales all of the app's text and spacing.">
        <Radio.Group
          type="segment"
          value={settings.textSize}
          onChange={(textSize) => updateSettings({ textSize })}
          aria-label="Text size"
        >
          {TEXT_SIZES.map((option) => (
            <Radio key={option.value} value={option.value} className="px-3 py-1.5 text-sm">
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      </Choice>

      <Choice label="Message spacing" hint="Compact fits more messages on the screen.">
        <Radio.Group
          type="segment"
          value={settings.density}
          onChange={(density) => updateSettings({ density })}
          aria-label="Message spacing"
        >
          {DENSITIES.map((option) => (
            <Radio key={option.value} value={option.value} className="px-3 py-1.5 text-sm">
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      </Choice>

      <Choice label="Clock" hint="How times are shown. Automatic follows your language and region.">
        <Radio.Group type="segment" value={settings.clock} onChange={(clock) => updateSettings({ clock })} aria-label="Clock">
          {CLOCKS.map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              description={sample(option.value === "auto" ? undefined : option.value === "12h")}
              className="px-3 py-1.5 text-sm"
            >
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      </Choice>
    </section>
  );
}

/** A labelled group of choices in a settings section. */
function Choice({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{label}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** How you're signed in, and signing out. */
function AccountSettings({
  signedIn,
  email,
  provider,
  onSignOut,
}: {
  signedIn: boolean;
  email?: string;
  /** How they sign in ("Google", "email"…), when known. */
  provider?: string;
  onSignOut: () => void;
}) {
  const { state } = useChatContext();
  const self = state.users[state.selfId];
  if (!self) return null;
  const button =
    "inline-flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-sm font-medium hover:bg-surface";

  return (
    <section aria-label="Account" className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <Avatar name={self.name} color={self.color} src={self.avatarUrl} size="lg" status={self.status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{self.name}</span>
          <span className="block truncate text-xs text-muted">
            {self.statusEmoji || self.statusText ? <CustomStatus user={self} /> : PRESENCE_LABELS[state.presence].label}
          </span>
          <span className="block truncate text-xs text-muted">
            {signedIn ? `Signed in${provider && provider !== "email" ? ` with ${provider}` : ""}${email ? ` as ${email}` : ""}` : "Guest"}
          </span>
        </span>
      </div>
      {!signedIn && (
        <SectionNote>
          Guests are forgotten when they sign out. Sign in to keep your name, message people directly and upload files.
        </SectionNote>
      )}
      {provider === "email" && (
        <div className="rounded-xl border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold">Change password</h3>
          <PasswordForm submitLabel="Change password" />
        </div>
      )}
      <button type="button" onClick={onSignOut} className={`${button} text-danger`}>
        <LogOut aria-hidden className="size-4" />
        Sign out
      </button>
    </section>
  );
}
