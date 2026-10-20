// System messages: notices the server posts when something happens.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { randomUUID } from "node:crypto";
import type { SystemEvent } from "../chat/types";
import { findGroup, toChannel } from "./access.ts";
import { db } from "./db.ts";
import { toMessage } from "./messages.ts";
import { channels, latest, type MessageRow } from "./state.ts";

// ---------------------------------------------------------------------------
// System messages: notices the server posts when something happens. The
// author is who did it; `system` says what (see SystemEvent).
// ---------------------------------------------------------------------------

/** Where group-wide notices go: the first uncategorized text channel, else the first text channel, else the first. */
export function mainChannel(groupId: string) {
  const list = findGroup(groupId)?.subgroups ?? [];
  const text = list.filter((s) => (s.type ?? "text") === "text");
  return (text.find((s) => !s.category) ?? text[0] ?? list[0])?.id;
}

/** Post a system message that `actorId` caused, and send it to everyone who can read the channel. */
export async function postSystem(channelId: string | undefined, actorId: string, system: SystemEvent) {
  if (!channelId || !channels.has(channelId)) return;
  const { data, error } = await db.from("messages")
    .insert({ id: randomUUID(), channel_id: channelId, author_id: actorId, body: "", attachments: [], system })
    .select("*").single();
  if (error || !data) {
    console.error("system message failed:", error?.message);
    return;
  }
  const message = toMessage(data as MessageRow);
  latest.set(channelId, message);
  toChannel(channelId).emit("message:new", message);
}
