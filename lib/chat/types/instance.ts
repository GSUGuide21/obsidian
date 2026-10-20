import type { User } from "./users";

/** A ban from the whole instance (app-wide admins only). */
export type InstanceBan = {
  user: User;
  reason?: string;
  at: number;
  by?: string;
};

/** Instance-wide settings, changed by app-wide admins. */
export type ObsidianSettings = {
  /** Shown in the sidebar and the tab title. */
  name: string;
  /** A notice shown to everyone above the chat; absent for none. */
  notice?: string;
  /** Whether people can join as guests without signing in. */
  guestsAllowed: boolean;
};

export const DEFAULT_SETTINGS: ObsidianSettings = { name: "Obsidian", guestsAllowed: true };
export const MAX_INSTANCE_NAME_LENGTH = 40;
export const MAX_NOTICE_LENGTH = 300;
export const MAX_BIO_LENGTH = 300;
