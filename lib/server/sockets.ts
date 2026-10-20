// The socket.io server (the HTTP server attaches itself, see server.mts) and connection cleanup.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { Server } from "socket.io";
import type { ClientToServerEvents, HistoryPage, ServerToClientEvents } from "../chat/types";
import { connections, idleSockets, members, type ChatSocket, type SocketData } from "./state.ts";
import { touchLastSeen, toUser } from "./users.ts";

// ---------------------------------------------------------------------------
// Sockets. The HTTP server attaches itself (see server.mts).
// ---------------------------------------------------------------------------

export const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>({
  // Next.js handles its own upgrade requests (dev HMR) on the same server,
  // so socket.io must not destroy upgrades it doesn't recognise.
  destroyUpgrade: false,
  maxHttpBufferSize: 64 * 1024,
});

export function release(socket: ChatSocket) {
  const userId = socket.data.userId;
  if (!userId) return;
  if (socket.data.idle) {
    socket.data.idle = false;
    const idle = (idleSockets.get(userId) ?? 1) - 1;
    if (idle > 0) idleSockets.set(userId, idle);
    else idleSockets.delete(userId);
  }
  socket.data.userId = undefined;

  const remaining = (connections.get(userId) ?? 1) - 1;
  if (remaining > 0) {
    connections.set(userId, remaining);
    return;
  }
  connections.delete(userId);
  touchLastSeen(userId);
  // Guests have no account to come back to, so they leave the member list
  // (their row stays, so old messages keep their name). Signed-in users stay
  // listed as offline.
  const row = members.get(userId);
  if (row?.kind === "guest") {
    io.emit("user:remove", userId);
  } else if (row) {
    io.emit("user:update", toUser(row));
  }
}

export const emptyPage: HistoryPage = { messages: [], users: [], hasMore: false };
