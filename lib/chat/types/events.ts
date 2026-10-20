import type { Attachment, CollectionKind, EventAttachment, EventReminder, GifResult, LinkPreview } from "./attachments";
import type { BotResult, ManagedBot } from "./bots";
import type { Call, CallResult, CallSignal } from "./calls";
import type {
  ChannelDraft,
  DiscoverPage,
  Group,
  GroupBan,
  GroupDraft,
  GroupRoleDraft,
  InviteLink,
  InviteLinkResult,
  InvitePreview,
  NotificationLevel,
  Notify,
  RedeemResult,
  Webhook,
} from "./groups";
import type { InstanceBan, ObsidianSettings } from "./instance";
import type { CollectionPage, HistoryPage, LookupResult, MarkUnreadResult, Message, Pin, QuizAnswerResult, Reaction, SavedPage, ScheduledMessage, ScheduleResult, SearchPage, SendResult, ThreadPage, ThreadSummary, TypingEvent, WikiPage, WikiSaveResult } from "./messages";
import type { ModerationLogPage, ReportsPage } from "./moderation";
import type { MemberRole } from "./permissions";
import type { Member, MemberProfile, Presence, User } from "./users";

export type Snapshot = {
  self: User;
  settings: ObsidianSettings;
  users: User[];
  groups: Group[];
  /** Most recent message per subgroup, keyed by subgroup id. */
  latest: Record<string, Message>;
  /** Unread messages per subgroup since this member last read it (capped at 100). */
  unread: Record<string, number>;
  /** When this member last read each subgroup (ms), for the "New messages" divider. */
  lastRead: Record<string, number>;
  /** Unread messages that mention you, per subgroup (capped at 100). */
  mentions: Record<string, number>;
  /** Your notification settings, by group or channel id. */
  notifications: Record<string, NotificationLevel>;
  /** The presence you picked (others see "invisible" as offline). */
  presence: Presence;
  /** People you've blocked. */
  blocked: string[];
  /** Open reports per group, for the groups whose reports you review. */
  reports: Record<string, number>;
  /** Whether you share read receipts ("Seen by"); off hides yours and theirs. */
  readReceipts: boolean;
  /** GIF search is set up on this server. */
  gifs: boolean;
  /** The messages you saved for later (ids, most recent first; up to MAX_SAVED). */
  saved: string[];
};

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export type PushSubscriptionInfo = { endpoint: string; keys: { p256dh: string; auth: string } };

export type DmResult = { ok: true; subgroupId: string } | { ok: false; error: string };

export type JoinResult = Snapshot | { error: string };

export interface ServerToClientEvents {
  "user:update": (user: User) => void;
  /** A guest went offline and was removed (guests aren't kept once they leave). */
  "user:remove": (userId: string) => void;
  "message:new": (message: Message) => void;
  /** A message was edited or deleted (full replacement, reactions included). */
  "message:update": (message: Message) => void;
  "message:reactions": (event: { subgroupId: string; messageId: string; reactions: Reaction[] }) => void;
  "poll:votes": (event: { subgroupId: string; messageId: string; pollVotes: Record<string, string[][]> }) => void;
  /** A thread root's summary changed; `thread` is absent once it has no replies. */
  "thread:summary": (event: { subgroupId: string; messageId: string; thread?: ThreadSummary }) => void;
  /** `pinned` is absent once it's unpinned. */
  "message:pin": (event: { subgroupId: string; messageId: string; pinned?: Pin }) => void;
  "wiki:update": (page: WikiPage) => void;
  /** Groups or channels were created, edited or deleted: the full new list. */
  "groups:update": (groups: Group[]) => void;
  /** Someone joined the group, or their role or mute changed. */
  "member:update": (event: { groupId: string; member: Member }) => void;
  /** Someone left, was kicked or was banned from the group. */
  "member:remove": (event: { groupId: string; userId: string }) => void;
  typing: (event: TypingEvent) => void;
  /** An event you can see (or are attending) is coming up. */
  "event:reminder": (reminder: EventReminder) => void;
  /** Instance settings changed: the full new settings. */
  "obsidian:update": (settings: ObsidianSettings) => void;
  /** While you watch the discover page: its new contents, a moment after something on it changed. */
  "discover:update": (page: DiscoverPage) => void;
  /** Something you'd want to hear about (see NotifyReason), already filtered by your notification settings. */
  notify: (event: Notify) => void;
  /** Someone was banned from or unbanned on the whole instance. Banned people are then disconnected. */
  "obsidian:banstatus": (event: { userId: string; banned: boolean }) => void;
  /** The server is about to shut down (an admin stopped it). */
  "obsidian:shutdown": () => void;
  /** The server is about to restart; clients reconnect on their own. */
  "obsidian:restart": () => void;
  /**
   * A call you can see started or changed (someone joined, left, muted, or
   * stopped being rung). Also sent for every ongoing call when you join a session.
   */
  "call:update": (call: Call) => void;
  "call:end": (event: { callId: string; subgroupId: string }) => void;
  /** Connection setup from `from` (a participant's socket id) in a call you're in. */
  "call:signal": (signal: CallSignal & { from: string }) => void;
  /** Your blocked list changed (from another tab, or this one): the full new list. */
  "blocks:update": (blocked: string[]) => void;
  /** For those who review a group's reports: how many are open now. */
  "report:count": (event: { groupId: string; open: number }) => void;
  /** While you're looking at a group: a member read a channel of it up to `at` (ms), for "Seen by". */
  "read:update": (event: { subgroupId: string; userId: string; at: number }) => void;
  /** One of your scheduled messages in this channel was posted (or failed): refresh the list. */
  "schedule:update": (event: { subgroupId: string }) => void;
}

export interface ClientToServerEvents {
  /** Signed-in users: push to this browser while you have no tab open (replaces the endpoint's previous owner). */
  "push:subscribe": (payload: PushSubscriptionInfo, ack: (result: ActionResult) => void) => void;
  "push:unsubscribe": (payload: { endpoint: string }, ack: (result: ActionResult) => void) => void;
  /**
   * Moderators and up: a new invite link. `expiresIn` (ms) and `maxUses` are
   * optional; without them it works until revoked, for anyone.
   */
  "invite:create": (
    payload: { groupId: string; expiresIn?: number; maxUses?: number },
    ack: (result: InviteLinkResult) => void,
  ) => void;
  /** Moderators and up: the group's links that still work, newest first. */
  "invite:list": (payload: { groupId: string }, ack: (links: InviteLink[]) => void) => void;
  "invite:revoke": (payload: { code: string }, ack: (result: ActionResult) => void) => void;
  /** What a link leads to; `null` if it doesn't work (anymore). */
  "invite:preview": (payload: { code: string }, ack: (preview: InvitePreview | null) => void) => void;
  /** Join the group a link leads to (counts one use). */
  "invite:redeem": (payload: { code: string }, ack: (result: RedeemResult) => void) => void;
  /** Flag someone else's message for the group's moderators. */
  "report:create": (payload: { messageId: string; reason?: string }, ack: (result: ActionResult) => void) => void;
  /** Moderators and up: the group's open reports; `null` for everyone else. */
  "report:list": (payload: { groupId: string }, ack: (page: ReportsPage | null) => void) => void;
  /** Moderators and up: close a report, removing the message (`remove`) or leaving it up. */
  "report:resolve": (payload: { id: string; remove: boolean }, ack: (result: ActionResult) => void) => void;
  /** Block or unblock someone. */
  "block:set": (payload: { userId: string; blocked: boolean }, ack: (result: ActionResult) => void) => void;
  /** Say whether you're going to the event at `index` in the message (you're added to or removed from its attendees). */
  "event:rsvp": (
    payload: { messageId: string; index: number; going: boolean },
    ack: (result: ActionResult) => void,
  ) => void;
  /** How far the group's members have read a channel (ms, by member id; you excluded), for "Seen by". */
  "read:positions": (payload: { subgroupId: string }, ack: (positions: Record<string, number>) => void) => void;
  /** Mark every channel of a group read, or (without `groupId`) everything you're in. */
  "read:markAll": (payload: { groupId?: string }, ack: (result: ActionResult) => void) => void;
  /** Mark a channel unread from `messageId` (a top-level message in it) on: you've read up to the one before it. */
  "read:unmark": (payload: { subgroupId: string; messageId: string }, ack: (result: MarkUnreadResult) => void) => void;
  /** Answer the quiz at `quiz` (its index in the message's attachments), once; the server grades it. */
  "quiz:answer": (
    payload: { messageId: string; quiz: number; option: number },
    ack: (result: QuizAnswerResult) => void,
  ) => void;
  /** Save a message for later, or un-save it. Only you see what you saved. */
  "saved:set": (payload: { messageId: string; saved: boolean }, ack: (result: ActionResult) => void) => void;
  /** Your saved messages you can still read, most recently saved first; `before` continues after that message. */
  "saved:list": (payload: { before?: string }, ack: (page: SavedPage) => void) => void;
  /** Your privacy settings: read receipts ("Seen by") on or off, both ways. */
  "privacy:set": (payload: { readReceipts: boolean }, ack: (result: ActionResult) => void) => void;
  /** Those who manage the group: its blocked words; `null` for everyone else. */
  "group:filter": (payload: { groupId: string }, ack: (words: string[] | null) => void) => void;
  /**
   * Signed-in users send their Supabase access token and the server derives
   * their id and name from it. Guests send a random id and a display name.
   */
  "session:join": (
    payload: {
      userId: string;
      name: string;
      /** Guests only; signed-in users' profiles come from their verified token. */
      color?: string;
      avatarUrl?: string;
      bio?: string;
      accessToken?: string;
    },
    ack: (result: JoinResult) => void,
  ) => void;
  /** Latest page, or the page before message `before` (an id) when scrolling up. */
  history: (payload: { subgroupId: string; before?: string }, ack: (page: HistoryPage) => void) => void;
  /** Everyone who joined the group, with their roles. Empty if you can't see the group. */
  "member:list": (payload: { groupId: string }, ack: (members: Member[]) => void) => void;
  /**
   * This member joins the group. Fails if they're banned, or it's private and
   * they weren't invited. Posting in a public group also joins it.
   */
  "member:join": (payload: { groupId: string }, ack: (result: ActionResult) => void) => void;
  /** Moderators and up. Lets `userId` join the group (needed for private groups). */
  "member:invite": (payload: { groupId: string; userId: string }, ack: (result: ActionResult) => void) => void;
  /** Moderators and up: people with a pending invite, oldest first. Empty for everyone else. */
  "member:invites": (payload: { groupId: string }, ack: (users: User[]) => void) => void;
  /** Withdraws a pending invite: moderators and up revoke anyone's; invitees decline their own. */
  "member:uninvite": (payload: { groupId: string; userId: string }, ack: (result: ActionResult) => void) => void;
  /** This member leaves the group. Owners must transfer ownership first. */
  "member:leave": (payload: { groupId: string }, ack: (result: ActionResult) => void) => void;
  /** Changes a member's role in the group. Ownership moves only via `member:transfer`. */
  "member:update": (
    payload: { groupId: string; userId: string; role: Exclude<MemberRole, "owner"> },
    ack: (result: ActionResult) => void,
  ) => void;
  /** Mutes a member in the group until `until` (ms); `until: null` unmutes. */
  "member:mute": (
    payload: { groupId: string; userId: string; until: number | null },
    ack: (result: ActionResult) => void,
  ) => void;
  /** Removes a member from the group; they can rejoin. */
  "member:kick": (payload: { groupId: string; userId: string }, ack: (result: ActionResult) => void) => void;
  /** Removes a member and bars them from rejoining until `until` (ms), or for good without it. */
  "member:ban": (
    payload: { groupId: string; userId: string; reason?: string; until?: number },
    ack: (result: ActionResult) => void,
  ) => void;
  /** Owner only. Makes another member the owner; the old owner becomes an admin. */
  "member:transfer": (payload: { groupId: string; userId: string }, ack: (result: ActionResult) => void) => void;
  /** Admins and up: the group's active bans, newest first. Empty for everyone else. */
  "member:bans": (payload: { groupId: string }, ack: (bans: GroupBan[]) => void) => void;
  /**
   * Admins and up (see canViewModerationLog): the group's moderation log,
   * newest first; `before` (an entry id) continues past a previous page.
   * `null` for everyone else, or if it couldn't be loaded.
   */
  "moderation:log": (
    payload: { groupId: string; before?: string },
    ack: (page: ModerationLogPage | null) => void,
  ) => void;
  /** Admins and up. Lifts a ban; they can rejoin (private groups still need an invite). */
  "member:unban": (payload: { groupId: string; userId: string }, ack: (result: ActionResult) => void) => void;
  /** Sets your own profile in the group; `null` goes back to your app-wide profile. */
  "member:profile": (
    payload: { groupId: string; profile: MemberProfile | null },
    ack: (result: ActionResult) => void,
  ) => void;
  /** App-wide admins only: change instance settings (only the keys given). */
  "obsidian:update": (payload: Partial<ObsidianSettings>, ack: (result: ActionResult) => void) => void;
  /** App-wide admins only: ban someone from the whole instance and disconnect them. */
  "obsidian:ban": (payload: { userId: string; reason?: string }, ack: (result: ActionResult) => void) => void;
  "obsidian:unban": (payload: { userId: string }, ack: (result: ActionResult) => void) => void;
  /** App-wide admins only: everyone banned from the instance, newest first. */
  "obsidian:bans": (payload: Record<string, never>, ack: (bans: InstanceBan[]) => void) => void;
  /** App-wide admins only: warn everyone, then stop the server (exit code 0). */
  "obsidian:shutdown": (payload: Record<string, never>, ack: (result: ActionResult) => void) => void;
  /**
   * App-wide admins only: warn everyone, then exit with code 1 so a process
   * manager (systemd `Restart=on-failure`, pm2, Docker) starts it again.
   */
  "obsidian:restart": (payload: Record<string, never>, ack: (result: ActionResult) => void) => void;
  /** Fetch specific messages (e.g. reply targets older than the loaded history). */
  "messages:lookup": (
    payload: { subgroupId: string; ids: string[] },
    ack: (result: LookupResult) => void,
  ) => void;
  /**
   * `threadId` posts a reply in that message's thread instead of the channel.
   * Text that runs a slash command (a default one, or a group bot's) is run
   * first: if it refuses, nothing is posted and `error` says why; otherwise
   * the bot's answer follows as a reply.
   */
  "message:send": (
    payload: {
      id: string;
      subgroupId: string;
      text: string;
      attachments?: Attachment[];
      threadId?: string;
      /** false: the sender removed the link's preview card while writing; the message gets none. */
      preview?: boolean;
    },
    ack: (result: SendResult) => void,
  ) => void;
  /** A thread's root and its latest replies. */
  "thread:history": (payload: { rootId: string }, ack: (page: ThreadPage) => void) => void;
  /** Messages with events, polls, quizzes or media (see CollectionKind) across all of a group's channels. */
  "group:collection": (
    payload: { groupId: string; kind: CollectionKind },
    ack: (page: CollectionPage) => void,
  ) => void;
  /**
   * Public groups you can see, with their stats, and their upcoming events.
   * Also starts sending "discover:update" when they change, until "discover:leave".
   */
  discover: (payload: Record<string, never>, ack: (page: DiscoverPage) => void) => void;
  "discover:leave": () => void;
  /** The channel you're looking at, or `null` for none (counts you as online in its group). */
  view: (payload: { subgroupId: string | null }) => void;
  /**
   * Your presence and custom status (only the keys given). `text`/`emoji`
   * `null` clear the custom status; `until` (ms) clears it then, `null` never.
   */
  "status:set": (
    payload: { presence?: Presence; text?: string | null; emoji?: string | null; until?: number | null },
    ack: (result: ActionResult) => void,
  ) => void;
  /** This tab has been idle for a while (or isn't anymore): all idle shows you as away. */
  "presence:idle": (payload: { idle: boolean }) => void;
  /** Your notification level for a group or channel; `null` goes back to the default. */
  "notifications:set": (
    payload: { targetId: string; level: NotificationLevel | null },
    ack: (result: ActionResult) => void,
  ) => void;
  /**
   * Messages containing every word of `query`, newest first: in one channel
   * (`subgroupId`), one group (`groupId`), or all your groups and direct
   * messages. `before` (a message id) continues past a previous page.
   */
  search: (
    payload: { query: string; subgroupId?: string; groupId?: string; before?: string },
    ack: (page: SearchPage) => void,
  ) => void;
  /**
   * Signed-in users: open the direct message with exactly these people (you
   * besides), starting it if there isn't one yet. They must be signed in too.
   */
  "dm:open": (payload: { userIds: string[] }, ack: (result: DmResult) => void) => void;
  /**
   * Start a call in a channel you can read, joining it from this connection:
   * in a direct message it rings the others; elsewhere it's a drop-in room.
   * If the channel already has a call, this joins that one.
   */
  "call:start": (payload: { subgroupId: string; video: boolean }, ack: (result: CallResult) => void) => void;
  /** Join (or answer) a call from this connection, leaving any other call it's in. */
  "call:join": (payload: { callId: string; video: boolean }, ack: (result: CallResult) => void) => void;
  "call:leave": (payload: { callId: string }) => void;
  /** Stop ringing for this member (on all their tabs). */
  "call:decline": (payload: { callId: string }) => void;
  /** Relay connection setup to another participant's socket (`to`). */
  "call:signal": (payload: CallSignal & { to: string }) => void;
  /** What this connection is sending now. */
  "call:media": (payload: { callId: string; audio: boolean; video: boolean; screen: boolean }) => void;
  /** Pinned messages in a channel, most recently pinned first. */
  pins:(payload: { subgroupId: string }, ack: (result: LookupResult) => void) => void;
  /** Signed-in members only; top-level channel messages only. */
  "message:pin": (payload: { id: string; pinned: boolean }, ack: (result: ActionResult) => void) => void;
  /**
   * Post a copy of a message you can read into another chat you can post in,
   * marked as forwarded from its author (who it was replying to is dropped).
   */
  "message:forward": (payload: { messageId: string; subgroupId: string }, ack: (result: SendResult) => void) => void;
  /** Post a message later (from a minute to MAX_SCHEDULE_AHEAD out); checked again when it's sent. */
  "schedule:create": (
    payload: { subgroupId: string; text: string; attachments?: Attachment[]; sendAt: number },
    ack: (result: ScheduleResult) => void,
  ) => void;
  /** Your messages waiting to be posted in a channel (and any that failed), soonest first. */
  "schedule:list": (payload: { subgroupId: string }, ack: (scheduled: ScheduledMessage[]) => void) => void;
  "schedule:cancel": (payload: { id: string }, ack: (result: ActionResult) => void) => void;
  /** Those who manage the channel's group: its webhooks; `null` for everyone else. */
  "webhook:list": (payload: { subgroupId: string }, ack: (webhooks: Webhook[] | null) => void) => void;
  /** Those who manage the channel's group: a new webhook; `token` is its secret, only ever shown now (see webhookUrl). */
  "webhook:create": (
    payload: { subgroupId: string; name: string },
    ack: (result: { ok: true; webhook: Webhook; token: string } | { ok: false; error: string }) => void,
  ) => void;
  "webhook:delete": (payload: { id: string }, ack: (result: ActionResult) => void) => void;
  /** Those who manage the group: its bots, with their URLs; `null` for everyone else. */
  "bot:list": (payload: { groupId: string }, ack: (bots: ManagedBot[] | null) => void) => void;
  /** Those who manage the group: add a bot (an https URL that answers BotRequests); `secret` is only ever shown now. */
  "bot:add": (payload: { groupId: string; name: string; url: string }, ack: (result: BotResult) => void) => void;
  /** Those who manage the group: ask the bot for its commands again. */
  "bot:refresh": (payload: { id: string }, ack: (result: BotResult) => void) => void;
  /** Those who manage the group: its commands go; its old messages stay. */
  "bot:remove": (payload: { id: string }, ack: (result: ActionResult) => void) => void;
  /** Those who manage the group: add a custom emoji (an uploaded image) as :name:. */
  "emoji:add": (payload: { groupId: string; name: string; url: string }, ack: (result: ActionResult) => void) => void;
  "emoji:remove": (payload: { groupId: string; name: string }, ack: (result: ActionResult) => void) => void;
  /** Admins and up: make a custom role (without `id`) or change one. Everyone sees it with "groups:update". */
  "role:save": (payload: GroupRoleDraft & { groupId: string; id?: string }, ack: (result: ActionResult) => void) => void;
  /** Admins and up: delete a custom role; whoever held it loses it. */
  "role:delete": (payload: { groupId: string; id: string }, ack: (result: ActionResult) => void) => void;
  /** Admins and up: set the custom roles someone holds (yourself, or members ranked below you). */
  "member:roles": (payload: { groupId: string; userId: string; roles: string[] }, ack: (result: ActionResult) => void) => void;
  /** Admins and up: put the group's custom roles in this order (ids). */
  "roles:reorder": (payload: { groupId: string; order: string[] }, ack: (result: ActionResult) => void) => void;
  /** GIFs for a search (or trending ones for an empty query); `null` when GIFs aren't set up. */
  "gif:search": (payload: { query: string }, ack: (results: GifResult[] | null) => void) => void;
  /** The card a message with this link would get, while it's being written; `null` if it wouldn't get one. */
  "link:preview": (payload: { url: string }, ack: (preview: LinkPreview | null) => void) => void;
  /**
   * Signed-in users: delete your account. Your messages stay, without your
   * name. Owners must transfer their groups first. `confirm` must be "delete".
   */
  "account:delete": (payload: { confirm: string }, ack: (result: ActionResult) => void) => void;
  "wiki:get": (payload: { subgroupId: string }, ack: (page: WikiPage | null) => void) => void;
  /** Signed-in members only. Fails if the page changed since `baseVersion`. */
  "wiki:save": (
    payload: { subgroupId: string; body: string; baseVersion: number },
    ack: (result: WikiSaveResult) => void,
  ) => void;
  typing: (payload: { subgroupId: string; typing: boolean }) => void;
  /**
   * Replaces the event at `index` in the message's attachments (its attendees
   * are kept). Its author, and moderators and up for members below them.
   */
  "event:update": (
    payload: { messageId: string; index: number; event: EventAttachment },
    ack: (result: ActionResult) => void,
  ) => void;
  /** Authors only. Edits the text; attachments stay as they were. */
  "message:edit": (payload: { id: string; text: string }, ack: (result: SendResult) => void) => void;
  /** Authors, and moderators and up for messages of members ranked below them. */
  "message:delete": (payload: { id: string }, ack: (result: ActionResult) => void) => void;
  /** Adds the reaction, or removes it if this member already reacted with that emoji. */
  "reaction:toggle": (payload: { messageId: string; emoji: string }, ack: (result: ActionResult) => void) => void;
  /** `option: null` withdraws the vote. */
  "poll:vote": (
    payload: { messageId: string; poll: number; option: number | null },
    ack: (result: ActionResult) => void,
  ) => void;
  /** This member has read the subgroup up to (and including) `messageId`. */
  "read:mark": (payload: { subgroupId: string; messageId: string }) => void;
  /**
   * Without `id` it creates the group (with a #general channel) and makes its
   * creator the owner: signed-in users only, rate limited. With `id` it edits
   * it: those who manage the group (see canManageGroup). `visibility` defaults to public.
   */
  "group:save": (payload: GroupDraft & { id?: string }, ack: (result: SaveResult) => void) => void;
  /** The group's owner and app-wide admins. Deletes the group with all its channels and messages. */
  "group:delete": (payload: { id: string }, ack: (result: ActionResult) => void) => void;
  /** Those who manage the group. Without `id` it creates the channel in `groupId`. */
  "channel:save": (payload: ChannelDraft & { id?: string }, ack: (result: SaveResult) => void) => void;
  /** Those who manage the channel's group. Deletes the channel and all its messages. */
  "channel:delete": (payload: { id: string }, ack: (result: ActionResult) => void) => void;
  /** Your own sidebar order: `order` lists every group you're in. */
  "groups:reorder": (payload: { order: string[] }, ack: (result: ActionResult) => void) => void;
  /**
   * Those who manage the group (both groups when it moves between them). Moves
   * channel `id` into `groupId` (and `category`, absent for none). `order`
   * lists every channel id of that group, `id` included, in the new order:
   * the order everyone sees.
   */
  "channel:move": (
    payload: { id: string; groupId: string; category?: string; order: string[] },
    ack: (result: ActionResult) => void,
  ) => void;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * `id` is the saved group's or channel's id (new or existing). Creating a
 * group also creates its first channel: `channelId`.
 */
export type SaveResult = { ok: true; id: string; channelId?: string } | { ok: false; error: string };
