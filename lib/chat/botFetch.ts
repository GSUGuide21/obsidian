// Calling group bots (server only: server.mts imports it by path, so `import
// type` only from the app, and Node built-ins).
//
// Same network rules as link previews (see previewFetch.ts): never private or
// internal addresses, checked in the DNS lookup used to connect. On top of
// that: https only, standard port, no redirects (a bot's URL is where it
// answers), a short timeout and a small size cap. Every request is signed.

import { createHmac } from "node:crypto";
import { request } from "node:https";
import { fetchable, publicOnlyLookup } from "./previewFetch.ts";
import type { BotRequest } from "./types";

const MAX_BYTES = 64 * 1024;

/** The signature header's value: HMAC-SHA256 of `<timestamp>.<body>` with the bot's secret. */
export function signature(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Whether a bot may live at this URL: https on the standard port, no credentials, no private address. */
export function botUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && fetchable(url) && !url.hash ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export type BotReply =
  | { ok: true; status: number; body: unknown }
  | { ok: false; reason: "timeout" | "unreachable" | "status" | "invalid"; status?: number };

/** POST the request to the bot, signed; its JSON answer (`body` is null for an empty one). */
export function callBot(url: string, secret: string, payload: BotRequest, timeout: number) {
  return new Promise<BotReply>((resolve) => {
    const body = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const target = new URL(url);
    if (target.protocol !== "https:" || !fetchable(target)) return resolve({ ok: false, reason: "unreachable" });
    let settled = false;
    const finish = (reply: BotReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(reply);
    };
    const outgoing = request(target, {
      method: "POST",
      lookup: publicOnlyLookup,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": "ObsidianChat/1.0 (bot interaction)",
        "x-obsidian-timestamp": timestamp,
        "x-obsidian-signature": signature(secret, timestamp, body),
      },
    });
    // The whole exchange, not just a quiet socket.
    const timer = setTimeout(() => {
      finish({ ok: false, reason: "timeout" });
      outgoing.destroy();
    }, timeout);
    outgoing.on("error", () => finish({ ok: false, reason: "unreachable" }));
    outgoing.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        response.resume();
        return finish({ ok: false, reason: "status", status });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          finish({ ok: false, reason: "invalid", status });
          outgoing.destroy();
        } else chunks.push(chunk);
      });
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        if (!text) return finish({ ok: true, status, body: null });
        try {
          finish({ ok: true, status, body: JSON.parse(text) });
        } catch {
          finish({ ok: false, reason: "invalid", status });
        }
      });
    });
    outgoing.end(body);
  });
}
