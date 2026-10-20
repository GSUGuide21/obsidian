// Integrations: incoming webhooks and group bots.

import { randomBytes } from "node:crypto";
import { botUrl } from "../../chat/botFetch.ts";
import { canManage, channelFor, findGroup } from "../access.ts";
import { canManageBots, fetchManifest, findBot, MAX_BOTS_PER_GROUP, toManagedBot } from "../bots.ts";
import { MAX_NAME_LENGTH } from "../constants.ts";
import { db } from "../db.ts";
import { colorFor } from "../identity.ts";
import { canReact } from "../limits.ts";
import { logModeration } from "../moderation.ts";
import { BOT_COLUMNS, botMemberId, botsByGroup, channels, type BotRow, type ChatSocket } from "../state.ts";
import { publishStructure } from "../structure.ts";
import { publishUser, usersByIds } from "../users.ts";
import { cleanName } from "../validation.ts";
import { MAX_WEBHOOKS_PER_CHANNEL, sha256, toWebhook } from "../webhooks.ts";

export function registerIntegrationsHandlers(socket: ChatSocket) {
  socket.on("webhook:list", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const channel = channelFor(payload?.subgroupId, userId);
    if (!userId || !channel || !canManage(channel.groupId, userId)) return ack(null);
    const { data, error } = await db.from("channel_webhooks").select("id, channel_id, name, created_by, created_at")
      .eq("channel_id", channel.id).order("created_at");
    if (error) {
      console.error("webhook list failed:", error.message);
      return ack(null);
    }
    ack(data.map(toWebhook));
  });

  socket.on("webhook:create", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const channel = channelFor(payload?.subgroupId, userId);
    if (!channel || !canManage(channel.groupId, userId)) {
      return ack({ ok: false, error: "Only the group's owner and admins can make webhooks." });
    }
    const name = cleanName(payload.name);
    if (!name) return ack({ ok: false, error: `Webhook names must be 1–${MAX_NAME_LENGTH} characters.` });
    const { count } = await db.from("channel_webhooks").select("id", { count: "exact", head: true }).eq("channel_id", channel.id);
    if ((count ?? 0) >= MAX_WEBHOOKS_PER_CHANNEL) {
      return ack({ ok: false, error: `A channel can have up to ${MAX_WEBHOOKS_PER_CHANNEL} webhooks.` });
    }
    const id = randomBytes(6).toString("hex");
    const token = randomBytes(24).toString("base64url");
    // Its messages are posted by a bot member of its own, which outlives it (old messages keep the name).
    const botId = `webhook-${id}`;
    const { error: memberError } = await db.from("members").insert({ id: botId, kind: "bot", name });
    const { error: profileError } = memberError
      ? { error: memberError }
      : await db.from("profiles").insert({ member_id: botId, color: colorFor(botId) });
    const { data, error } = profileError
      ? { data: null, error: profileError }
      : await db.from("channel_webhooks")
        .insert({ id, channel_id: channel.id, name, token_hash: sha256(token), created_by: userId })
        .select("id, channel_id, name, created_by, created_at").single();
    if (error || !data) {
      console.error("webhook create failed:", error?.message);
      return ack({ ok: false, error: "Couldn't make the webhook. Try again." });
    }
    ack({ ok: true, webhook: toWebhook(data), token });
    await logModeration(channel.groupId, userId, null, { action: "webhook_create", name, subgroupId: channel.id });
  });

  socket.on("webhook:delete", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const id = typeof payload?.id === "string" && /^[a-z0-9]{12}$/.test(payload.id) ? payload.id : "";
    const { data: hook } = id
      ? await db.from("channel_webhooks").select("channel_id, name").eq("id", id).maybeSingle()
      : { data: null };
    if (!hook) return ack({ ok: true }); // already gone
    const channel = channels.get(hook.channel_id);
    if (!channel || !canManage(channel.groupId, userId)) {
      return ack({ ok: false, error: "Only the group's owner and admins can delete webhooks." });
    }
    const { error } = await db.from("channel_webhooks").delete().eq("id", id);
    if (error) {
      console.error("webhook delete failed:", error.message);
      return ack({ ok: false, error: "Couldn't delete the webhook. Try again." });
    }
    ack({ ok: true });
    await logModeration(channel.groupId, userId, null, { action: "webhook_delete", name: hook.name, subgroupId: channel.id });
  });

  socket.on("bot:list", (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const group = findGroup(payload?.groupId);
    if (!userId || !group || !canManage(group.id, userId)) return ack(null);
    ack((botsByGroup.get(group.id) ?? []).map(toManagedBot));
  });

  socket.on("bot:add", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const group = findGroup(payload?.groupId);
    if (!group || !canManage(group.id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can add bots." });
    if (!canManageBots(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const name = cleanName(payload.name);
    if (!name) return ack({ ok: false, error: `Bot names must be 1–${MAX_NAME_LENGTH} characters.` });
    const url = botUrl(payload.url);
    if (!url) return ack({ ok: false, error: "The bot's URL must be a public https:// address." });
    if ((botsByGroup.get(group.id)?.length ?? 0) >= MAX_BOTS_PER_GROUP) {
      return ack({ ok: false, error: `A group can have up to ${MAX_BOTS_PER_GROUP} bots.` });
    }
    const id = randomBytes(6).toString("hex");
    const secret = randomBytes(32).toString("base64url");
    // Worth a try, but the bot may refuse: it can't check the signature until it's given the secret.
    const manifest = await fetchManifest({ id, group_id: group.id, url, secret });
    const commands = "error" in manifest ? [] : manifest.commands;

    // It posts as a bot member of its own, which outlives it (old messages keep the name).
    const memberId = botMemberId(id);
    const { error: memberError } = await db.from("members").insert({ id: memberId, kind: "bot", name });
    const { error: profileError } = memberError
      ? { error: memberError }
      : await db.from("profiles").insert({ member_id: memberId, color: colorFor(memberId) });
    const { data, error } = profileError
      ? { data: null, error: profileError }
      : await db.from("group_bots")
        .insert({ id, group_id: group.id, name, url, secret, commands, created_by: userId })
        .select(BOT_COLUMNS).single();
    if (error || !data) {
      console.error("bot add failed:", error?.message);
      return ack({ ok: false, error: "Couldn't add the bot. Try again." });
    }
    // Everyone needs to know who its answers are from.
    await usersByIds([memberId]);
    publishUser(memberId);
    await publishStructure();
    ack({
      ok: true,
      bot: toManagedBot(data as BotRow),
      secret,
      skipped: "error" in manifest ? [] : manifest.skipped,
      ...("error" in manifest && {
        warning: `${manifest.error} Give it the signing secret below, then press "Refresh commands".`,
      }),
    });
    await logModeration(group.id, userId, memberId, { action: "bot_add", name, url });
  });

  socket.on("bot:refresh", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const bot = findBot(payload?.id);
    if (!bot) return ack({ ok: false, error: "That bot no longer exists." });
    if (!canManage(bot.group_id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can manage bots." });
    if (!canManageBots(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const manifest = await fetchManifest(bot);
    if ("error" in manifest) return ack({ ok: false, error: manifest.error! });
    const { data, error } = await db.from("group_bots").update({ commands: manifest.commands })
      .eq("id", bot.id).select(BOT_COLUMNS).single();
    if (error || !data) {
      console.error("bot refresh failed:", error?.message);
      return ack({ ok: false, error: "Couldn't save the bot's commands. Try again." });
    }
    await publishStructure();
    ack({ ok: true, bot: toManagedBot(data as BotRow), skipped: manifest.skipped });
  });

  socket.on("bot:remove", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const bot = findBot(payload?.id);
    if (!bot) return ack({ ok: true }); // already gone
    if (!canManage(bot.group_id, userId)) return ack({ ok: false, error: "Only the group's owner and admins can remove bots." });
    const { error } = await db.from("group_bots").delete().eq("id", bot.id);
    if (error) {
      console.error("bot remove failed:", error.message);
      return ack({ ok: false, error: "Couldn't remove the bot. Try again." });
    }
    await publishStructure();
    ack({ ok: true });
    await logModeration(bot.group_id, userId, botMemberId(bot.id), { action: "bot_remove", name: bot.name, url: bot.url });
  });
}
