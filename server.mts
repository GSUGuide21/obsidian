// Obsidian Chat's server: Next.js and the live chat (socket.io) on one HTTP
// server. The chat is in lib/server: one module per area (state.ts holds what's
// kept in memory), and handlers/ registers every socket event, by area.

// First, so .env.local is loaded before anything reads it.
import { port, production } from "./lib/server/env.ts";
import { createServer } from "node:http";
import next from "next";
import { DISAPPEAR_SWEEP } from "./lib/server/constants.ts";
import { sweepExpired } from "./lib/server/disappearing.ts";
import { sendDueReminders } from "./lib/server/reminders.ts";
import { sendDueScheduled } from "./lib/server/scheduled.ts";
import { io } from "./lib/server/sockets.ts";
import { channels } from "./lib/server/state.ts";
import { loadState } from "./lib/server/structure.ts";
import { handleWebhook } from "./lib/server/webhooks.ts";
import { registerHandlers } from "./lib/server/handlers/index.ts";

const httpServer = createServer((req, res) => {
  // Webhooks post into the live chat, so this server answers them itself.
  if (req.method === "POST" && req.url?.startsWith("/api/webhooks/")) {
    void handleWebhook(req, res).catch((error) => {
      console.error("webhook failed:", error instanceof Error ? error.message : error);
      if (!res.headersSent) res.writeHead(500).end();
    });
    return;
  }
  void handle(req, res);
});
const app = next({ dev: !production, httpServer, port });
const handle = app.getRequestHandler();

io.attach(httpServer);
io.on("connection", registerHandlers);

Promise.all([app.prepare(), loadState()])
  .then(() => {
    setInterval(() => void sendDueReminders(), 30_000);
    setInterval(() => void sendDueScheduled(), 15_000);
    setInterval(() => void sweepExpired(), DISAPPEAR_SWEEP);
    httpServer.listen(port, () => {
      console.log(
        `> Obsidian Chat ready on http://localhost:${port} (${production ? "production" : "development"}, ${channels.size} channels)`,
      );
    });
  })
  .catch((error) => {
    console.error(`> Failed to start: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
