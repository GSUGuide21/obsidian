/** Someone in a call, on one connection (a person is in a call from one tab at a time). */
export type CallParticipant = {
  /** Their connection: what call signals are addressed to. */
  socketId: string;
  userId: string;
  /** What they're sending. */
  audio: boolean;
  video: boolean;
  screen: boolean;
  joinedAt: number;
};

/** A voice/video call: one that rings, in a direct message, or a drop-in room in a channel. */
export type Call = {
  id: string;
  subgroupId: string;
  groupId: string;
  kind: "dm" | "room";
  /** Started with video (callees are offered video first). */
  video: boolean;
  startedBy: string;
  startedAt: number;
  /** Connected, in the order they joined. */
  participants: CallParticipant[];
  /** People being rung who haven't answered yet. */
  ringing: string[];
};

export type CallResult = { ok: true; call: Call } | { ok: false; error: string };

/** A WebRTC session description, as relayed between two people in a call. */
export type CallDescription = { type: "offer" | "answer"; sdp: string };
/** A WebRTC ICE candidate (shaped like RTCIceCandidateInit). */
export type CallCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};
/** Connection setup between two people in a call: one description or one candidate. */
export type CallSignal = { callId: string; description?: CallDescription; candidate?: CallCandidate };
