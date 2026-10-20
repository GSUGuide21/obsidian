import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import { getSettings } from "./settings";
import type {
  Call,
  CallCandidate,
  CallDescription,
  CallResult,
  CallSignal,
  ClientToServerEvents,
  ServerToClientEvents,
} from "./types";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ACK_TIMEOUT = 10_000;

/** STUN finds a direct route between browsers; TURN (if configured) relays when there isn't one. */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(","),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

type Peer = {
  pc: RTCPeerConnection;
  /** We make the offers on this connection: we joined after them. */
  offerer: boolean;
  /** Signals are applied one at a time, in the order they came. */
  queue: Promise<void>;
};

/** What this tab is sending. */
export type CallMedia = { audio: boolean; video: boolean; screen: boolean };

type CallSnapshot = {
  /** The call this tab is in. */
  callId: string | null;
  /** This tab's connection, to tell its own tile apart. */
  socketId: string | null;
  preview: MediaStream | null;
  remote: Record<string, MediaStream>;
  media: CallMedia;
};

const IDLE: CallSnapshot = {
  callId: null,
  socketId: null,
  preview: null,
  remote: {},
  media: { audio: false, video: false, screen: false },
};

/**
 * This tab's side of a call: the media it sends and one WebRTC connection per
 * other participant. Everyone who joins later connects to those already there
 * (and makes the offers), so two people never offer to each other at once.
 * Turning the camera or screen share on and off swaps the track being sent,
 * without renegotiating.
 */
class CallEngine {
  callId: string | null = null;
  mic: MediaStreamTrack | null = null;
  camera: MediaStreamTrack | null = null;
  screen: MediaStreamTrack | null = null;
  /** What you see of yourself: the video being sent. */
  preview: MediaStream | null = null;
  readonly peers = new Map<string, Peer>();
  /** Each participant's incoming media, by socket id. */
  readonly remote = new Map<string, MediaStream>();

  constructor(
    private readonly socket: ChatSocket,
    private readonly onChange: () => void,
  ) {}

  get media(): CallMedia {
    return { audio: Boolean(this.mic?.enabled), video: Boolean(this.camera), screen: Boolean(this.screen) };
  }

  /** What there is to render, as of now. */
  snapshot(): CallSnapshot {
    return {
      callId: this.callId,
      socketId: this.socket.id ?? null,
      preview: this.preview,
      remote: Object.fromEntries(this.remote),
      media: this.media,
    };
  }

  private video() {
    return this.screen ?? this.camera;
  }

  private changed() {
    const video = this.video();
    this.preview = video ? new MediaStream([video]) : null;
    if (this.callId) this.socket.emit("call:media", { callId: this.callId, ...this.media });
    this.onChange();
  }

  private signal(to: string, signal: Omit<CallSignal, "callId">) {
    if (this.callId) this.socket.emit("call:signal", { callId: this.callId, to, ...signal });
  }

  /** Send `track` on every connection's audio or video sender. */
  private sendEverywhere(kind: "audio" | "video", track: MediaStreamTrack | null) {
    for (const { pc } of this.peers.values()) {
      const sender = pc.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender;
      void sender?.replaceTrack(track).catch(() => {});
    }
  }

  private connect(socketId: string, offerer: boolean) {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer: Peer = { pc, offerer, queue: Promise.resolve() };
    this.peers.set(socketId, peer);

    pc.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) this.signal(socketId, { candidate: candidate.toJSON() as CallCandidate });
    });

    pc.addEventListener("iceconnectionstatechange", () => {
      if (pc.iceConnectionState === "failed" && peer.offerer) pc.restartIce();
    });

    pc.addEventListener("track", ({ track }) => {
      const stream = this.remote.get(socketId) ?? new MediaStream();
      if (!stream.getTracks().includes(track)) stream.addTrack(track);
      // A new object, so the tile re-renders with it.
      this.remote.set(socketId, new MediaStream(stream.getTracks()));
      this.onChange();
    });

    pc.addEventListener("negotiationneeded", async () => {
      if (!peer.offerer) return;
      try {
        await pc.setLocalDescription();
        this.signal(socketId, { description: pc.localDescription!.toJSON() as CallDescription });
      } catch (error) {
        console.warn("call offer failed:", error);
      }
    });
    
    pc.addEventListener("connectionstatechange", () => {
      // Networks change (Wi-Fi to cellular): the offerer finds a new route.
      if (pc.connectionState === "failed" && peer.offerer) pc.restartIce();
    });

    if (offerer) {
      for (const kind of ["audio", "video"] as const) {
        const transceiver = pc.addTransceiver(kind, { direction: "sendrecv" });
        void transceiver.sender.replaceTrack(kind === "audio" ? this.mic : this.video());
      }
    }
    return peer;
  }

  private disconnect(socketId: string) {
    this.peers.get(socketId)?.pc.close();
    this.peers.delete(socketId);
    this.remote.delete(socketId);
  }

  /** Line the connections up with who's in the call now. */
  sync(call: Call) {
    const self = call.participants.findIndex((p) => p.socketId === this.socket.id);
    // Gone from the call (e.g. it was answered in another tab): this tab hangs up.
    if (self < 0) return this.stop();
    call.participants.forEach((p, index) => {
      if (index < self && !this.peers.has(p.socketId)) this.connect(p.socketId, true);
    });
    for (const socketId of this.peers.keys()) {
      if (!call.participants.some((p) => p.socketId === socketId)) this.disconnect(socketId);
    }
    this.onChange();
  }

  receive({ from, description, candidate }: CallSignal & { from: string }) {
    const peer = this.peers.get(from) ?? this.connect(from, false);
    const { pc } = peer;
    peer.queue = peer.queue
      .then(async () => {
        if (description) {
          await pc.setRemoteDescription(description);
          if (description.type !== "offer") return;
          // Answer with our own media, on the senders the offer set up.
          for (const transceiver of pc.getTransceivers()) {
            transceiver.direction = "sendrecv";
            const kind = transceiver.receiver.track.kind;
            await transceiver.sender.replaceTrack(kind === "audio" ? this.mic : this.video());
          }
          await pc.setLocalDescription();
          this.signal(from, { description: pc.localDescription!.toJSON() as CallDescription });
        } else if (candidate) {
          await pc.addIceCandidate(candidate);
        }
      })
      .catch((error) => console.warn("call signal failed:", error));
  }

  /** Start sending in `call` (after joining it on the server). */
  enter(call: Call, tracks: { mic: MediaStreamTrack | null; camera: MediaStreamTrack | null }) {
    this.stop();
    this.callId = call.id;
    this.mic = tracks.mic;
    this.camera = tracks.camera;
    this.sync(call);
    this.changed();
  }

  /** Hang up this tab: close every connection and stop the mic, camera and screen. */
  stop() {
    for (const socketId of [...this.peers.keys()]) this.disconnect(socketId);
    for (const track of [this.mic, this.camera, this.screen]) track?.stop();
    this.mic = this.camera = this.screen = null;
    this.preview = null;
    this.callId = null;
    this.onChange();
  }

  toggleMic() {
    if (!this.mic) return;
    this.mic.enabled = !this.mic.enabled;
    this.changed();
  }

  /** Resolves to an error message. */
  async toggleCamera() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints() });
        this.camera = stream.getVideoTracks()[0] ?? null;
      } catch {
        return "Couldn't turn on your camera. Check your browser's permissions.";
      }
    }
    if (!this.screen) this.sendEverywhere("video", this.camera);
    this.changed();
  }

  /** Resolves to an error message (nothing if you just cancelled). */
  async toggleScreen() {
    if (this.screen) return this.stopScreen();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      this.screen = track;
      // The browser's own "Stop sharing" button.
      track.onended = () => this.stopScreen();
      this.sendEverywhere("video", track);
      this.changed();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      return "Couldn't share your screen.";
    }
  }

  private stopScreen() {
    this.screen?.stop();
    this.screen = null;
    this.sendEverywhere("video", this.camera);
    this.changed();
  }
}

/** The camera chosen in settings (else the front one), at up to 720p. */
function cameraConstraints(): MediaTrackConstraints {
  const { cameraId } = getSettings();
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(cameraId ? { deviceId: { ideal: cameraId } } : { facingMode: "user" }),
  };
}

/** The microphone chosen in settings, else the default. */
function micConstraints(): MediaTrackConstraints | true {
  const { micId } = getSettings();
  return micId ? { deviceId: { ideal: micId } } : true;
}

type Acquired = { mic: MediaStreamTrack | null; camera: MediaStreamTrack | null; error: string | null };

/** The mic (and camera) to call with; whatever's unavailable is left out, with an error saying so. */
async function acquire(video: boolean): Promise<Acquired> {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    return { mic: null, camera: null, error: "Calls need a secure (https) connection and a browser that supports them." };
  }
  try {
    const stream = await media.getUserMedia({ audio: micConstraints(), video: video ? cameraConstraints() : false });
    return { mic: stream.getAudioTracks()[0] ?? null, camera: stream.getVideoTracks()[0] ?? null, error: null };
  } catch {
    if (video) {
      const fallback = await acquire(false);
      return { ...fallback, error: fallback.error ?? "Couldn't turn on your camera, so you joined with audio only." };
    }
    return { mic: null, camera: null, error: "Couldn't use your microphone, so you joined muted. Check your browser's permissions." };
  }
}

export type CallControls = ReturnType<typeof useCall>;

/** Calls over the chat's connection: the ones you can see, the one this tab is in, and its controls. */
export function useCall(socketRef: RefObject<ChatSocket | null>) {
  const engineRef = useRef<CallEngine | null>(null);
  // Rendering reads this copy of the engine's state, never the engine itself.
  const [snapshot, setSnapshot] = useState<CallSnapshot>(IDLE);
  const [calls, setCalls] = useState<Record<string, Call>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onUpdate = useEffectEvent((call: Call) => {
    setCalls((prev) => ({ ...prev, [call.id]: call }));
    if (engineRef.current?.callId === call.id) engineRef.current.sync(call);
  });
  const onEnd = useEffectEvent(({ callId }: { callId: string }) => {
    const ended = calls[callId];
    // A call you started ended with you alone in it: nobody picked up.
    const alone = ended?.participants.every((p) => p.socketId === socketRef.current?.id);
    if (engineRef.current?.callId === callId && ended?.kind === "dm" && alone) setError("No answer.");
    setCalls((prev) => {
      const next = { ...prev };
      delete next[callId];
      return next;
    });
    if (engineRef.current?.callId === callId) engineRef.current.stop();
  });

  // The chat creates the socket in its own effect, which runs before this one.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const engine: CallEngine = new CallEngine(socket, () => setSnapshot(engine.snapshot()));
    engineRef.current = engine;
    const onSignal = (signal: CallSignal & { from: string }) => {
      if (signal.callId === engine.callId) engine.receive(signal);
    };
    // The server drops a disconnected socket from its call; the list is resent on rejoining.
    const onDisconnect = () => {
      engine.stop();
      setCalls({});
    };
    socket.on("call:update", onUpdate);
    socket.on("call:end", onEnd);
    socket.on("call:signal", onSignal);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("call:update", onUpdate);
      socket.off("call:end", onEnd);
      socket.off("call:signal", onSignal);
      socket.off("disconnect", onDisconnect);
      engine.stop();
      engineRef.current = null;
    };
  }, [socketRef]);

  /** Get the mic (and camera), then join via `event`; resolves to an error message. */
  async function enter(event: "call:start" | "call:join", payload: { subgroupId: string } | { callId: string }, video: boolean) {
    const socket = socketRef.current;
    const engine = engineRef.current;
    if (!socket?.connected || !engine) return "You're offline.";
    setBusy(true);
    setError(null);
    const tracks = await acquire(video);
    const result = await new Promise<CallResult>((resolve) => {
      const done = (err: Error | null, res?: CallResult) =>
        resolve(err || !res ? { ok: false, error: "Couldn't reach the server." } : res);
      if (event === "call:start") socket.timeout(ACK_TIMEOUT).emit(event, { ...(payload as { subgroupId: string }), video }, done);
      else socket.timeout(ACK_TIMEOUT).emit(event, { ...(payload as { callId: string }), video }, done);
    });
    setBusy(false);
    if (!result.ok) {
      tracks.mic?.stop();
      tracks.camera?.stop();
      setError(result.error);
      return result.error;
    }
    setCalls((prev) => ({ ...prev, [result.call.id]: result.call }));
    engine.enter(result.call, tracks);
    if (tracks.error) setError(tracks.error);
    return undefined;
  }

  return {
    /** Ongoing calls you can see, by id. */
    calls,
    /** The call this tab is in. */
    current: snapshot.callId ? calls[snapshot.callId] : undefined,
    /** Your own video, while you send any. */
    preview: snapshot.preview,
    /** Everyone else's media in the current call, by socket id. */
    remote: snapshot.remote,
    media: snapshot.media,
    /** This tab's connection id (its tile in the call). */
    selfSocketId: snapshot.socketId,
    /** Joining is in progress (waiting for permissions or the server). */
    busy,
    error,
    dismissError: () => setError(null),
    start: (subgroupId: string, video: boolean) => enter("call:start", { subgroupId }, video),
    join: (callId: string, video: boolean) => enter("call:join", { callId }, video),
    decline: (callId: string) => socketRef.current?.emit("call:decline", { callId }),
    leave: () => {
      const engine = engineRef.current;
      if (engine?.callId) socketRef.current?.emit("call:leave", { callId: engine.callId });
      engine?.stop();
    },
    toggleMic: () => engineRef.current?.toggleMic(),
    toggleCamera: async () => {
      const failure = await engineRef.current?.toggleCamera();
      if (failure) setError(failure);
    },
    toggleScreen: async () => {
      const failure = await engineRef.current?.toggleScreen();
      if (failure) setError(failure);
    },
    /** Screen sharing needs getDisplayMedia (desktop browsers). */
    canShareScreen: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia),
  };
}
