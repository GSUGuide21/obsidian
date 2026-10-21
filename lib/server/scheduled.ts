// Scheduled messages: a loop posts the due ones as their authors.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { randomUUID } from "node:crypto";
import { attachmentText } from "../chat/safety.ts";
import type { Attachment, ScheduledMessage } from "../chat/types";
import { accessOf, channelFor, socketsOf } from "./access.ts";
import { db } from "./db.ts";
import { toMessage } from "./messages.ts";
import { afterPost, announce, filterError, postingError, stickerError } from "./posting.ts";
import { members, type MessageRow } from "./state.ts";
import { usersByIds } from "./users.ts";

// ---------------------------------------------------------------------------
// Scheduled messages: a loop posts the due ones as their authors, checking
// again that they still can (access, mutes, the word filter). Rows are
// claimed first, so each goes out once even across restarts.
// ---------------------------------------------------------------------------

/** Mirrors MAX_SCHEDULED and MAX_SCHEDULE_AHEAD in lib/chat/types/messages.ts. */
export const MAX_SCHEDULED = 25;

export const MAX_SCHEDULE_AHEAD = 30 * 24 * 60 * 60 * 1000;

export type ScheduledRow = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  attachments: Attachment[];
  send_at: string;
  failure: string | null;
};

export function toScheduled(row: ScheduledRow): ScheduledMessage {
  return {
    id: row.id,
    subgroupId: row.channel_id,
    text: row.body,
    ...(row.attachments.length > 0 && { attachments: row.attachments }),
    sendAt: Date.parse(row.send_at),
    ...(row.failure && { failure: row.failure }),
  };
}

export let sendingScheduled = false;

export async function sendDueScheduled() {
  if (sendingScheduled) return;
  sendingScheduled = true;
  try {
    const { data, error } = await db.from("scheduled_messages").select("*")
      .is("sent_at", null).lte("send_at", new Date().toISOString()).order("send_at").limit(50);
    if (error) return console.error("scheduled query failed:", error.message);
    for (const row of data as ScheduledRow[]) {
      const { data: claimed } = await db.from("scheduled_messages").update({ sent_at: new Date().toISOString() })
        .eq("id", row.id).is("sent_at", null).select("id");
      if (!claimed?.length) continue;
      const failure = await postScheduled(row).catch((postError) => {
        console.error("scheduled send failed:", postError instanceof Error ? postError.message : postError);
        return "Something went wrong sending it.";
      });
      if (failure) await db.from("scheduled_messages").update({ failure }).eq("id", row.id);
      else await db.from("scheduled_messages").delete().eq("id", row.id);
      for (const socket of socketsOf(row.author_id)) socket.emit("schedule:update", { subgroupId: row.channel_id });
    }
  } finally {
    sendingScheduled = false;
  }
}

/** Post a due scheduled message; resolves to why it couldn't be, if it couldn't. */
export async function postScheduled(row: ScheduledRow) {
  await accessOf(row.author_id);
  if (!members.has(row.author_id)) await usersByIds([row.author_id]);
  const channel = channelFor(row.channel_id, row.author_id);
  if (!channel) return "You can no longer post in that channel.";
  const held = await postingError(channel, row.author_id, false, false);
  if (held) return held;
  // The sticker may have been taken out of the pack since.
  const filtered = filterError(channel.groupId, row.author_id, `${row.body}\n${attachmentText(row.attachments)}`) ??
    stickerError(channel.groupId, row.attachments);
  if (filtered) return filtered;
  const { data, error } = await db.from("messages")
    .insert({ id: randomUUID(), channel_id: channel.id, author_id: row.author_id, body: row.body, attachments: row.attachments })
    .select("*").single();
  if (error || !data) return "Couldn't save the message.";
  const message = toMessage(data as MessageRow);
  announce(message, channel);
  await afterPost(message, channel, { replyTo: null, root: null });
  return undefined;
}
