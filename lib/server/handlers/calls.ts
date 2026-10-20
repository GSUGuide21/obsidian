// Calls: starting, joining, leaving and relaying connection setup.

import { randomUUID } from "node:crypto";
import { addMember, channelFor, findGroup, roleIn } from "../access.ts";
import {
  callIn,
  callOfSocket,
  calls,
  canCall,
  canSignal,
  cleanCandidate,
  cleanDescription,
  endCall,
  joinCall,
  leaveCall,
  publishCall,
  RING_FOR,
  ringOut,
  ringTimers,
  unanswered,
} from "../calls.ts";
import { io } from "../sockets.ts";
import type { ChatSocket } from "../state.ts";

export function registerCallsHandlers(socket: ChatSocket) {
  socket.on("call:start", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canCall(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const channel = channelFor(payload?.subgroupId, userId);
    const group = channel && findGroup(channel.groupId);
    if (!channel || !group) return ack({ ok: false, error: "That channel no longer exists." });
    const dm = group.kind === "dm";
    // Starting a call in a public group joins it quietly, as posting does (you can already read it).
    if (!dm && !roleIn(group.id, userId)) {
      const joinError = await addMember(group.id, userId);
      if (joinError) {
        console.error("auto-join failed:", joinError.message);
        return ack({ ok: false, error: `Couldn't join ${group.name}. Try again.` });
      }
      if (socket.disconnected) return;
    }

    const video = payload.video === true;
    let call = callIn(channel.id);
    if (!call) {
      call = {
        id: randomUUID(),
        subgroupId: channel.id,
        groupId: group.id,
        kind: dm ? "dm" : "room",
        video,
        startedBy: userId,
        startedAt: Date.now(),
        participants: [],
        ringing: dm ? (group.members ?? []).filter((id) => id !== userId) : [],
      };
      calls.set(call.id, call);
      if (call.ringing.length > 0) {
        const id = call.id;
        ringTimers.set(id, setTimeout(() => ringOut(id), RING_FOR).unref());
      }
    }
    joinCall(socket, call, userId, video);
    ack({ ok: true, call });
  });

  socket.on("call:join", (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canCall(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const call = typeof payload?.callId === "string" ? calls.get(payload.callId) : undefined;
    if (!call || !channelFor(call.subgroupId, userId)) return ack({ ok: false, error: "That call has ended." });
    joinCall(socket, call, userId, payload.video === true);
    ack({ ok: true, call });
  });

  socket.on("call:leave", (payload) => {
    if (typeof payload?.callId === "string" && callOfSocket.get(socket.id) === payload.callId) leaveCall(socket);
  });

  socket.on("call:decline", (payload) => {
    const userId = socket.data.userId;
    const call = typeof payload?.callId === "string" ? calls.get(payload.callId) : undefined;
    if (!userId || !call?.ringing.includes(userId)) return;
    call.ringing = call.ringing.filter((id) => id !== userId);
    // Everyone declined a call nobody answered: the caller stops waiting.
    if (call.ringing.length === 0 && unanswered(call)) endCall(call);
    else publishCall(call);
  });

  socket.on("call:signal", (payload) => {
    const callId = callOfSocket.get(socket.id);
    const call = callId ? calls.get(callId) : undefined;
    if (!call || payload?.callId !== callId || !canSignal(socket.id)) return;
    const to = typeof payload.to === "string" ? payload.to : "";
    if (to === socket.id || !call.participants.some((p) => p.socketId === to)) return;
    const description = cleanDescription(payload.description);
    const candidate = cleanCandidate(payload.candidate);
    if (!description && !candidate) return;
    io.to(to).emit("call:signal", {
      callId: call.id,
      from: socket.id,
      ...(description && { description }),
      ...(candidate && { candidate }),
    });
  });

  socket.on("call:media", (payload) => {
    const call = calls.get(callOfSocket.get(socket.id) ?? "");
    const self = call?.participants.find((p) => p.socketId === socket.id);
    if (!call || !self || payload?.callId !== call.id || !canSignal(socket.id)) return;
    self.audio = payload.audio === true;
    self.video = payload.video === true;
    self.screen = payload.screen === true;
    publishCall(call);
  });
}
