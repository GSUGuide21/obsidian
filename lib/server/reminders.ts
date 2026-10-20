// Event reminders: saved when an event is posted, sent by a loop.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { EventReminder, Message } from "../chat/types";
import { channelFor, socketsOf, toChannel } from "./access.ts";
import { db } from "./db.ts";
import { loadMessage } from "./messages.ts";

// ---------------------------------------------------------------------------
// Event reminders: saved per reminder time when an event is posted, then
// sent by a loop that claims due rows (so each goes out once, even across
// restarts). They go to everyone who can read the channel, or only to the
// people going when the event says so (remindGoingOnly).
// ---------------------------------------------------------------------------

/** Save the reminders of the message's events (only the one at `only`, when given). */
export async function saveReminders(message: Message, only?: number) {
  const now = Date.now();
  const rows = (message.attachments ?? []).flatMap((attachment, index) =>
    attachment.type === "event" && !attachment.cancelled && (only === undefined || index === only)
      ? [...new Set(attachment.reminders ?? [])]
          .filter((at) => at > now)
          .map((at) => ({
            message_id: message.id,
            attachment_index: index,
            channel_id: message.subgroupId,
            remind_at: new Date(at).toISOString(),
          }))
      : [],
  );
  if (rows.length === 0) return;
  const { error } = await db.from("event_reminders").upsert(rows, { ignoreDuplicates: true });
  if (error) console.error("saving reminders failed:", error.message);
}

export const REMINDER_GRACE = 60 * 60 * 1000;

export let sendingReminders = false;

export async function sendDueReminders() {
  if (sendingReminders) return;
  sendingReminders = true;
  try {
    const { data, error } = await db.from("event_reminders")
      .select("message_id, attachment_index, channel_id, remind_at")
      .is("sent_at", null).lte("remind_at", new Date().toISOString())
      .order("remind_at").limit(100);
    if (error) return console.error("reminder query failed:", error.message);
    for (const row of data) {
      // Claim it first, so it's only sent once.
      const { data: claimed } = await db.from("event_reminders").update({ sent_at: new Date().toISOString() })
        .eq("message_id", row.message_id).eq("attachment_index", row.attachment_index).eq("remind_at", row.remind_at)
        .is("sent_at", null).select("message_id");
      if (!claimed?.length) continue;
      const message = await loadMessage(row.message_id);
      const event = message && !message.deleted_at ? message.attachments?.[row.attachment_index] : undefined;
      // Reminders missed while the server was down are pointless once the event is well under way.
      if (event?.type !== "event" || event.cancelled || event.startTime < Date.now() - REMINDER_GRACE) continue;
      const reminder: EventReminder = {
        subgroupId: row.channel_id,
        messageId: row.message_id,
        title: event.title,
        startTime: event.startTime,
        ...(event.allDay && { allDay: true }),
      };
      // The event's creator picks: everyone in the channel (the default), or only who's going.
      if (event.remindGoingOnly) {
        for (const id of event.attendees ?? []) {
          if (!channelFor(row.channel_id, id)) continue;
          for (const socket of socketsOf(id)) socket.emit("event:reminder", reminder);
        }
      } else {
        toChannel(row.channel_id).emit("event:reminder", reminder);
      }
    }
  } finally {
    sendingReminders = false;
  }
}
