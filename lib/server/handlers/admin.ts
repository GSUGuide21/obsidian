// Instance administration: app-wide admins only.

import type { InstanceBan } from "../../chat/types";
import { cleanSettings, isAdmin, socketsOf } from "../access.ts";
import { MAX_INSTANCE_NAME_LENGTH, MAX_NOTICE_LENGTH } from "../constants.ts";
import { db } from "../db.ts";
import { canReact, canSend } from "../limits.ts";
import { io } from "../sockets.ts";
import { MEMBER_SELECT, members, setSettings, settings, toMemberRow, type ChatSocket } from "../state.ts";
import { toUser, usersByIds } from "../users.ts";
import { optionalText } from "../validation.ts";

export function registerAdminHandlers(socket: ChatSocket) {
  socket.on("obsidian:update", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!isAdmin(userId)) return ack({ ok: false, error: "Only admins can change settings." });
    if (!canSend(userId!)) return ack({ ok: false, error: "Slow down a little and try again." });
    const input: Record<string, unknown> = payload && typeof payload === "object" ? payload : {};
    const next = cleanSettings(input, settings);
    // Anything given but not applied was invalid.
    if (input.name !== undefined && next.name !== String(input.name).trim().replace(/\s+/g, " ")) {
      return ack({ ok: false, error: `Names must be 1–${MAX_INSTANCE_NAME_LENGTH} characters.` });
    }
    if (typeof input.notice === "string" && input.notice.trim().length > MAX_NOTICE_LENGTH) {
      return ack({ ok: false, error: `Notices are limited to ${MAX_NOTICE_LENGTH} characters.` });
    }
    const rows = (["name", "notice", "guestsAllowed"] as const)
      .filter((key) => key in input)
      // A cleared notice is stored as "" (the column can't hold SQL null).
      .map((key) => ({ key, value: next[key] ?? "", updated_at: new Date().toISOString(), updated_by: userId }));
    const { error } = rows.length ? await db.from("instance_settings").upsert(rows) : { error: null };
    if (error) {
      console.error("settings update failed:", error.message);
      return ack({ ok: false, error: "Couldn't save the settings. Try again." });
    }
    setSettings(next);
    io.emit("obsidian:update", settings);
    ack({ ok: true });
  });

  socket.on("obsidian:bans", async (_payload, ack) => {
    if (typeof ack !== "function") return;
    if (!isAdmin(socket.data.userId)) return ack([]);
    const { data, error } = await db.from("members").select(`${MEMBER_SELECT}, banned_at, ban_reason, banned_by` as const)
      .not("banned_at", "is", null).order("banned_at", { ascending: false }).limit(500);
    if (error) {
      console.error("instance ban list failed:", error.message);
      return ack([]);
    }
    ack(data.map((row): InstanceBan => ({
      user: toUser(toMemberRow(row)),
      at: Date.parse(row.banned_at),
      ...(row.ban_reason && { reason: row.ban_reason }),
      ...(row.banned_by && { by: row.banned_by }),
    })));
  });

  socket.on("obsidian:ban", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!isAdmin(userId)) return ack({ ok: false, error: "Only admins can ban people from the instance." });
    if (!canReact(userId!)) return ack({ ok: false, error: "Slow down a little and try again." });
    const targetId = typeof payload?.userId === "string" ? payload.userId : "";
    if (!targetId || targetId === userId) return ack({ ok: false, error: "Pick someone else." });
    if (!members.has(targetId)) await usersByIds([targetId]);
    const target = members.get(targetId);
    if (!target) return ack({ ok: false, error: "That person doesn't exist." });
    if (target.role === "admin" || target.kind === "bot") return ack({ ok: false, error: "Admins and bots can't be banned." });
    const reason = optionalText(payload?.reason, 200);
    if (reason === null) return ack({ ok: false, error: "Ban reasons are limited to 200 characters." });

    const { error } = await db.from("members")
      .update({ banned_at: new Date().toISOString(), ban_reason: reason ?? null, banned_by: userId })
      .eq("id", targetId);
    if (error) {
      console.error("instance ban failed:", error.message);
      return ack({ ok: false, error: "Couldn't ban them. Try again." });
    }
    io.emit("obsidian:banstatus", { userId: targetId, banned: true });
    for (const s of socketsOf(targetId)) s.disconnect(true);
    ack({ ok: true });
  });

  socket.on("obsidian:unban", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!isAdmin(userId)) return ack({ ok: false, error: "Only admins can lift instance bans." });
    const targetId = typeof payload?.userId === "string" ? payload.userId : "";
    const { error } = await db.from("members")
      .update({ banned_at: null, ban_reason: null, banned_by: null }).eq("id", targetId);
    if (error) {
      console.error("instance unban failed:", error.message);
      return ack({ ok: false, error: "Couldn't lift the ban. Try again." });
    }
    io.emit("obsidian:banstatus", { userId: targetId, banned: false });
    ack({ ok: true });
  });

  for (const [event, code] of [["obsidian:shutdown", 0], ["obsidian:restart", 1]] as const) {
    socket.on(event, (_payload, ack) => {
      if (typeof ack !== "function") return;
      const userId = socket.data.userId;
      if (!isAdmin(userId)) return ack({ ok: false, error: "Only admins can stop the server." });
      console.log(`> ${event === "obsidian:restart" ? "Restart" : "Shutdown"} requested by ${userId}`);
      io.emit(event);
      ack({ ok: true });
      // A moment for the notice to reach everyone, then go.
      setTimeout(() => {
        io.disconnectSockets(true);
        process.exit(code);
      }, 2000);
    });
  }
}
