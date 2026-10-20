// Moderation: reports, blocks and the moderation log.

import { accessOf, allowedIn, canAccess, channelFor, findGroup, socketsOf } from "../access.ts";
import { ID_PATTERN } from "../constants.ts";
import { db } from "../db.ts";
import { canReact, canRead } from "../limits.ts";
import { loadMessage } from "../messages.ts";
import {
  logModeration,
  MAX_REPORT_REASON_LENGTH,
  mayRemoveMessage,
  MODERATION_LOG_PAGE,
  publishReportCount,
  removeMessage,
  settleReports,
  snapshotOf,
  toModerationEntry,
  toReport,
  type ModerationRow,
  type ReportRow,
} from "../moderation.ts";
import { members, type ChatSocket } from "../state.ts";
import { usersByIds } from "../users.ts";
import { optionalText } from "../validation.ts";

export function registerModerationHandlers(socket: ChatSocket) {
  socket.on("report:create", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const reason = optionalText(payload?.reason, MAX_REPORT_REASON_LENGTH);
    if (reason === null) return ack({ ok: false, error: `Reasons are limited to ${MAX_REPORT_REASON_LENGTH} characters.` });
    const row = id ? await loadMessage(id) : null;
    const channel = row && channelFor(row.channel_id, userId);
    const group = channel && findGroup(channel.groupId);
    if (!row || row.deleted_at || !channel || !group) return ack({ ok: false, error: "That message no longer exists." });
    if (group.kind === "dm") return ack({ ok: false, error: "Nobody moderates direct messages. Block them instead." });
    if (row.system) return ack({ ok: false, error: "Notices can't be reported." });
    if (row.author_id === userId) return ack({ ok: false, error: "You can't report your own message." });
    const { error } = await db.from("message_reports").insert({
      group_id: group.id,
      message_id: row.id,
      reporter_id: userId,
      author_id: row.author_id,
      reason: reason ?? null,
      snapshot: snapshotOf(row),
    });
    // Already reported by them and still open: that's fine.
    if (error && error.code !== "23505") {
      console.error("report insert failed:", error.message);
      return ack({ ok: false, error: "Couldn't send the report. Try again." });
    }
    ack({ ok: true });
    if (!error) await publishReportCount(group.id);
  });

  socket.on("report:list", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const group = findGroup(payload?.groupId);
    if (!userId || !group || !canAccess(group, userId) || !canRead(socket.id)) return ack(null);
    if (!allowedIn(group.id, userId, "MESSAGE:MANAGE")) return ack(null);
    const { data, error } = await db.from("message_reports").select("*")
      .eq("group_id", group.id).is("resolved_at", null).order("id", { ascending: false }).limit(100);
    if (error) {
      console.error("report list failed:", error.message);
      return ack(null);
    }
    const reports = (data as ReportRow[]).map(toReport);
    const ids = new Set<string>();
    for (const report of reports) {
      if (report.reporterId) ids.add(report.reporterId);
      if (report.authorId) ids.add(report.authorId);
    }
    ack({ reports, users: await usersByIds(ids) });
  });

  socket.on("report:resolve", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const reportId = typeof payload?.id === "string" && /^\d{1,19}$/.test(payload.id) ? payload.id : "";
    const { data } = reportId ? await db.from("message_reports").select("*").eq("id", reportId).maybeSingle() : { data: null };
    const report = data as (ReportRow & { resolved_at: string | null }) | null;
    if (!report || report.resolved_at) return ack({ ok: true }); // already handled
    const group = findGroup(report.group_id);
    if (!group || !canAccess(group, userId) || !allowedIn(group.id, userId, "MESSAGE:MANAGE")) {
      return ack({ ok: false, error: "Only moderators and up can handle reports." });
    }
    if (payload.remove === true) {
      const row = await loadMessage(report.message_id);
      const channel = row && channelFor(row.channel_id, userId);
      if (row && !row.deleted_at && channel) {
        if (!(await mayRemoveMessage(row, channel, userId))) {
          return ack({ ok: false, error: "You can't remove messages from someone of your rank or above." });
        }
        // Removing settles every report about the message (see removeMessage).
        const failure = await removeMessage(row, channel, userId, false);
        return ack(failure ? { ok: false, error: failure } : { ok: true });
      }
      // Already gone (its author or someone else removed it): just close the reports.
      await settleReports(report.message_id, group.id, userId, "removed");
      return ack({ ok: true });
    }
    await settleReports(report.message_id, group.id, userId, "dismissed");
    ack({ ok: true });
    await logModeration(group.id, userId, report.author_id, {
      action: "report_dismiss",
      reportId,
      ...(report.reason && { reason: report.reason }),
      message: report.snapshot,
    });
  });

  socket.on("block:set", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const targetId = typeof payload?.userId === "string" ? payload.userId : "";
    if (!targetId || targetId === userId) return ack({ ok: false, error: "Pick someone else." });
    if (!members.has(targetId)) await usersByIds([targetId]);
    if (!members.has(targetId)) return ack({ ok: false, error: "That person doesn't exist." });
    const block = payload.blocked === true;
    const { error } = block
      ? await db.from("member_blocks").upsert({ member_id: userId, blocked_id: targetId }, { ignoreDuplicates: true })
      : await db.from("member_blocks").delete().eq("member_id", userId).eq("blocked_id", targetId);
    if (error) {
      console.error("block update failed:", error.message);
      return ack({ ok: false, error: block ? "Couldn't block them. Try again." : "Couldn't unblock them. Try again." });
    }
    const access = await accessOf(userId);
    if (block) access.blocked.add(targetId);
    else access.blocked.delete(targetId);
    for (const s of socketsOf(userId)) s.emit("blocks:update", [...access.blocked]);
    ack({ ok: true });
  });

  socket.on("moderation:log", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const group = findGroup(payload?.groupId);
    if (!userId || !group || group.kind === "dm" || !canAccess(group, userId) || !canRead(socket.id)) return ack(null);
    if (!allowedIn(group.id, userId, "GROUP:AUDIT")) return ack(null);

    let query = db.from("moderation_log").select("*").eq("group_id", group.id)
      .order("id", { ascending: false }).limit(MODERATION_LOG_PAGE + 1);
    const before = typeof payload.before === "string" && /^\d{1,19}$/.test(payload.before) ? payload.before : null;
    if (before) query = query.lt("id", before);
    const { data, error } = await query;
    if (error) {
      console.error("moderation log query failed:", error.message);
      return ack(null);
    }
    const rows = data as ModerationRow[];
    const entries = rows.slice(0, MODERATION_LOG_PAGE).map(toModerationEntry);
    // Everyone named: who acted, who it was done to, and the authors of snapshotted messages.
    const ids = new Set<string>();
    for (const entry of entries) {
      if (entry.actorId) ids.add(entry.actorId);
      if (entry.targetId) ids.add(entry.targetId);
      if ("message" in entry && entry.message.authorId) ids.add(entry.message.authorId);
    }
    ack({ entries, users: await usersByIds(ids), hasMore: rows.length > MODERATION_LOG_PAGE });
  });
}
