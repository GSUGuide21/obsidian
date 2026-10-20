// Limits and fixed values. Mirrors lib/chat/types (only permissions.ts is imported there; these are copied).
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { Attachment, CollectionKind, ObsidianSettings } from "../chat/types";

// Mirrors lib/chat/types (only permissions.ts is imported; these limits are copied).
export const MAX_MESSAGE_LENGTH = 2000;

export const MAX_NAME_LENGTH = 32;

export const MAX_PAGE_LENGTH = 20000;

export const MAX_PINS_PER_CHANNEL = 50;

export const HISTORY_PAGE = 100;

export const THREAD_PAGE = 200;

export const COLLECTION_PAGE = 100;

// Mirrors COLLECTION_TYPES in lib/chat/types/attachments.ts.
export const COLLECTION_TYPES: Record<CollectionKind, Attachment["type"][]> = {
  events: ["event"],
  polls: ["poll"],
  quizzes: ["quiz"],
  media: ["image", "video"],
  files: ["file", "audio"],
  voice: ["voice"],
};

// The discover page lists this many upcoming events, and batches its live updates this long (ms).
export const DISCOVER_EVENTS = 20;

export const DISCOVER_DEBOUNCE = 2000;

export const MAX_GROUP_DESCRIPTION_LENGTH = 200;

export const ID_PATTERN = /^[\w-]{8,64}$/;

// Mirror lib/chat/types.
export const MAX_STATUS_TEXT_LENGTH = 80;

export const MAX_DM_MEMBERS = 9;

export const MIN_SEARCH_LENGTH = 2;

export const SEARCH_PAGE = 50;

export const MAX_BIO_LENGTH = 300;

export const MAX_INSTANCE_NAME_LENGTH = 40;

export const MAX_NOTICE_LENGTH = 300;

export const DEFAULT_SETTINGS: ObsidianSettings = { name: "Obsidian", guestsAllowed: true };

// Mirrors MAX_SAVED in lib/chat/types/messages.ts.
export const MAX_SAVED = 500;

export const SAVED_PAGE = 50;
