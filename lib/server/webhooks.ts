// Incoming webhooks: POST /api/webhooks/<id>/<token> posts into the webhook's channel.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Webhook } from "../chat/types";
import { MAX_MESSAGE_LENGTH } from "./constants.ts";
import { db } from "./db.ts";
import { limiter } from "./limits.ts";
import { toMessage } from "./messages.ts";
import { afterPost, announce } from "./posting.ts";
import { channels, members, type MessageRow } from "./state.ts";
import { usersByIds } from "./users.ts";

// ---------------------------------------------------------------------------
// Incoming webhooks: POST /api/webhooks/<id>/<token> with {"content": "…"}
// posts into the webhook's channel as its bot member ("webhook-<id>"). Handled
// here, before Next.js, because it needs the live chat. Only a hash of the
// token is stored, compared in constant time.
// ---------------------------------------------------------------------------

export const MAX_WEBHOOKS_PER_CHANNEL = 10;

export const canHook = limiter(10, 0.5);

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function handleWebhook(req: IncomingMessage, res: ServerResponse) {
  const reply = (status: number, body?: object) => {
    res.writeHead(status, { "content-type": "application/json" }).end(body ? JSON.stringify(body) : undefined);
  };
  const match = /^\/api\/webhooks\/([a-z0-9]{12})\/([A-Za-z0-9_-]{20,64})\/?$/.exec(new URL(req.url ?? "/", "http://local").pathname);
  if (!match) return reply(404, { error: "Unknown webhook." });
  const [, id, token] = match;
  if (!canHook(id)) return reply(429, { error: "Too many messages. Slow down." });

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16 * 1024) return reply(413, { error: "The request is too large." });
  }
  const { data: hook } = await db.from("channel_webhooks").select("channel_id, name, token_hash").eq("id", id).maybeSingle();
  const given = Buffer.from(sha256(token), "hex");
  if (!hook || !timingSafeEqual(given, Buffer.from(hook.token_hash, "hex"))) return reply(404, { error: "Unknown webhook." });
  const channel = channels.get(hook.channel_id);
  if (!channel) return reply(404, { error: "The webhook's channel no longer exists." });

  let content: unknown;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    content = parsed.content ?? parsed.text;
  } catch {
    return reply(400, { error: 'Send JSON like {"content": "Hello"}.' });
  }
  const body = typeof content === "string" ? content.trim() : "";
  if (!body || body.length > MAX_MESSAGE_LENGTH) {
    return reply(400, { error: `"content" must be 1–${MAX_MESSAGE_LENGTH} characters.` });
  }
  const authorId = `webhook-${id}`;
  if (!members.has(authorId)) await usersByIds([authorId]);
  const { data, error } = await db.from("messages")
    .insert({ id: randomUUID(), channel_id: channel.id, author_id: authorId, body, attachments: [] })
    .select("*").single();
  if (error || !data) {
    console.error("webhook post failed:", error?.message);
    return reply(500, { error: "Couldn't post the message." });
  }
  const message = toMessage(data as MessageRow);
  announce(message, channel);
  reply(204);
  await afterPost(message, channel, { replyTo: null, root: null });
}

export function toWebhook(row: { id: string; channel_id: string; name: string; created_by: string | null; created_at: string }): Webhook {
  return {
    id: row.id,
    subgroupId: row.channel_id,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    ...(row.created_by && { createdBy: row.created_by }),
  };
}
