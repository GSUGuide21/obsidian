// Calls: who's in each call, ringing, and relaying connection setup (WebRTC).
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { Call, CallCandidate, CallDescription } from "../chat/types";
import { groupRoom } from "./access.ts";
import { limiter } from "./limits.ts";
import { io } from "./sockets.ts";
import type { ChatSocket } from "./state.ts";

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Calls. Voice and video go browser to browser (WebRTC); the server only
// keeps who's in each call and relays connection setup between them. One call
// per channel: in a direct message it rings the others, elsewhere it's a
// drop-in room. Calls live in memory, so a restart ends them.
// ---------------------------------------------------------------------------

/** How long a call rings before the unanswered stop being rung. */
export const RING_FOR = 45_000;

export const calls = new Map<string, Call>();

/** The call each socket is in. */
export const callOfSocket = new Map<string, string>();

export const ringTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const canCall = limiter(10, 0.5);

// Connection setup sends a burst of ICE candidates per person.
export const canSignal = limiter(400, 40);

export function callIn(channelId: string) {
  for (const call of calls.values()) if (call.subgroupId === channelId) return call;
  return undefined;
}

/** Everyone who can see the call's channel gets its new state. */
export function publishCall(call: Call) {
  io.to(groupRoom(call.groupId)).emit("call:update", call);
}

export function endCall(call: Call) {
  calls.delete(call.id);
  clearTimeout(ringTimers.get(call.id));
  ringTimers.delete(call.id);
  for (const p of call.participants) callOfSocket.delete(p.socketId);
  io.to(groupRoom(call.groupId)).emit("call:end", { callId: call.id, subgroupId: call.subgroupId });
}

/** Nobody but the caller ever answered: there's no call to keep. */
export function unanswered(call: Call) {
  return call.participants.every((p) => p.userId === call.startedBy);
}

/** Take the socket out of its call; a call ends once nobody's left in it. */
export function leaveCall(socket: ChatSocket) {
  const call = calls.get(callOfSocket.get(socket.id) ?? "");
  callOfSocket.delete(socket.id);
  if (!call) return;
  call.participants = call.participants.filter((p) => p.socketId !== socket.id);
  if (call.participants.length === 0) endCall(call);
  else publishCall(call);
}

/** Put the socket in the call (out of any other); one connection per person, so another tab of theirs drops out. */
export function joinCall(socket: ChatSocket, call: Call, userId: string, video: boolean) {
  if (callOfSocket.has(socket.id) && callOfSocket.get(socket.id) !== call.id) leaveCall(socket);
  for (const p of call.participants) if (p.userId === userId) callOfSocket.delete(p.socketId);
  call.participants = call.participants.filter((p) => p.userId !== userId);
  call.participants.push({ socketId: socket.id, userId, audio: true, video, screen: false, joinedAt: Date.now() });
  call.ringing = call.ringing.filter((id) => id !== userId);
  callOfSocket.set(socket.id, call.id);
  publishCall(call);
}

/** Ringing ran out: stop ringing, and end a call nobody answered. */
export function ringOut(callId: string) {
  ringTimers.delete(callId);
  const call = calls.get(callId);
  if (!call) return;
  call.ringing = [];
  if (unanswered(call)) endCall(call);
  else publishCall(call);
}

export function cleanDescription(value: unknown): CallDescription | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { type, sdp } = value as Record<string, unknown>;
  if ((type !== "offer" && type !== "answer") || typeof sdp !== "string" || sdp.length > 30_000) return undefined;
  return { type, sdp };
}

export function cleanCandidate(value: unknown): CallCandidate | undefined {
  if (!value || typeof value !== "object") return undefined;
  const c = value as Record<string, unknown>;
  if (typeof c.candidate !== "string" || c.candidate.length > 2000) return undefined;
  const optionalText = (v: unknown) => (typeof v === "string" && v.length <= 256 ? v : null);
  return {
    candidate: c.candidate,
    sdpMid: optionalText(c.sdpMid),
    sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? (c.sdpMLineIndex as number) : null,
    usernameFragment: optionalText(c.usernameFragment),
  };
}
