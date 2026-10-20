import type { Attachment } from "./attachments";
import type { MemberRole } from "./permissions";
import type { User } from "./users";

export type Message = {
  id: string;
  subgroupId: string;
  authorId: string;
  text: string;
  createdAt: number;
  attachments?: Attachment[];
  /** Set when the author edited the text. */
  editedAt?: number;
  /** It was deleted: text and attachments are gone, the row remains so replies still resolve. */
  deleted?: true;
  /** Set when a moderator (not the author) deleted it: their member id. */
  deletedBy?: string;
  /**
   * Set on system messages, which the server posts when something happens;
   * the author is who did it. They have no text or attachments, can't be
   * edited and don't count as unread.
   */
  system?: SystemEvent;
  reactions?: Reaction[];
  /** Votes per poll, keyed by the poll's index in `attachments`: member ids per option. */
  pollVotes?: Record<string, string[][]>;
  /**
   * Your answers to its quizzes, keyed by the quiz's index in `attachments`.
   * Only in what's loaded for you (history, threads, lookups); live updates
   * leave it out, so keep what you had.
   */
  quizAnswers?: Record<string, QuizAnswer>;
  /** Set on replies in a thread: the root message's id. Thread replies never show in the channel. */
  threadId?: string;
  /** Set on thread roots that have replies. */
  thread?: ThreadSummary;
  pinned?: Pin;
};

/** What a system message announces. The message's author is who did it. */
export type SystemEvent =
  /** Joined the group (posted in its main channel). */
  | { type: "member_join" }
  /** Left the group (posted in its main channel). */
  | { type: "member_leave" }
  /** Pinned `messageId` in this channel. */
  | { type: "message_pin"; messageId: string }
  /** Created this channel. */
  | { type: "channel_create" }
  | { type: "channel_rename"; from: string; to: string }
  /** Changed the channel's topic; absent when they cleared it. */
  | { type: "channel_topic"; topic?: string }
  /** Kicked a member from the group (posted in its main channel). */
  | { type: "member_kick"; memberId: string }
  /** Banned a member from the group (posted in its main channel). */
  | { type: "member_ban"; memberId: string }
  /** Gave a member a new role in the group; "owner" when they transferred ownership (posted in its main channel). */
  | { type: "member_role"; memberId: string; role: MemberRole };

/** When a message was pinned (ms), and by whom (a member id). */
export type Pin = { at: number; by: string };

export type ThreadSummary = {
  count: number;
  lastAt: number;
  /** A few recent repliers, most recent first. */
  participants: string[];
};

export type Reaction = { emoji: string; userIds: string[] };

/** Your answer to a quiz, and the right one (option indexes); the server grades it. */
export type QuizAnswer = { option: number; correct: number };

export type QuizAnswerResult = { ok: true; answer: QuizAnswer } | { ok: false; error: string };

/** Your saved messages, most recently saved first, plus everyone they refer to. */
export type SavedPage = {
  messages: Message[];
  users: User[];
  /** More, earlier saves exist beyond the ones returned. */
  hasMore: boolean;
};

/** Most messages one member can keep saved. */
export const MAX_SAVED = 500;

/** Marking a channel unread from a message: where you've now read up to (ms), and how many are unread. */
export type MarkUnreadResult = { ok: true; lastRead: number; unread: number } | { ok: false; error: string };

/** The page of a wiki channel. `version` is 0 until the first save. */
export type WikiPage = {
  subgroupId: string;
  body: string;
  version: number;
  updatedAt?: number;
  updatedBy?: string;
};

export type WikiSaveResult =
  | { ok: true; page: WikiPage }
  /** `page` is the current version when the save lost a race with someone else's. */
  | { ok: false; error: string; page?: WikiPage };

/** A thread: its root and replies (oldest first). `root: null` if it's gone. */
export type ThreadPage = {
  root: Message | null;
  replies: Message[];
  users: User[];
  /** Older replies exist beyond the ones returned. */
  hasMore: boolean;
};

/** Search results, newest first, plus everyone they refer to. */
export type SearchPage = {
  messages: Message[];
  users: User[];
  /** Older matches exist beyond the ones returned. */
  hasMore: boolean;
};

export const MIN_SEARCH_LENGTH = 2;

/** A page of channel history, oldest first, plus everyone it refers to. */
export type HistoryPage = {
  messages: Message[];
  /** Authors and mentioned members, including guests who have since left. */
  users: User[];
  /** More, older messages exist before this page. */
  hasMore: boolean;
};

export type LookupResult = { messages: Message[]; users: User[] };

/** Matching messages, newest first (thread replies included), plus everyone they refer to. */
export type CollectionPage = {
  messages: Message[];
  users: User[];
  /** Older matches exist beyond the ones returned. */
  hasMore: boolean;
};

export type SendResult =
  | { ok: true; message: Message }
  | { ok: false; error: string };

/** A message you scheduled: posted at `sendAt` (if you still can then). */
export type ScheduledMessage = {
  id: string;
  subgroupId: string;
  text: string;
  attachments?: Attachment[];
  sendAt: number;
  /** Why it couldn't be posted, once its time came. */
  failure?: string;
};

export type ScheduleResult = { ok: true; scheduled: ScheduledMessage } | { ok: false; error: string };

/** Up to this many messages waiting per member; up to this far ahead. */
export const MAX_SCHEDULED = 25;
export const MAX_SCHEDULE_AHEAD = 30 * 24 * 60 * 60 * 1000;

export type TypingEvent = { subgroupId: string; userId: string; typing: boolean };

export const MAX_REACTIONS_PER_MESSAGE = 20;

export const MAX_MESSAGE_LENGTH = 2000;

export const MAX_PAGE_LENGTH = 20000;

export const MAX_PINS_PER_CHANNEL = 50;
