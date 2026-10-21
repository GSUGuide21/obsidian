import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Most messages one export includes (newest first); more than any normal account has. */
const MAX_MESSAGES = 50_000;
const PAGE = 1000;

/**
 * GET: a signed-in user's data as a JSON download: their member record and
 * profile, group memberships, messages (and the earlier versions of the ones
 * they edited), reactions, poll votes, notification settings, blocks,
 * scheduled messages and uploads. Only their own rows.
 */
export async function GET() {
  // The session cookie is verified, not trusted.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return Response.json({ error: "Sign in to download your data." }, { status: 401 });

  const admin = createAdminClient();
  const own = <T,>(table: string, column = "member_id") =>
    admin.from(table).select("*").eq(column, userId).limit(10_000) as unknown as Promise<{ data: T[] | null }>;

  const [member, profile, memberships, reactions, votes, notifications, blocks, scheduled, uploads, edits] = await Promise.all([
    admin.from("members").select("id, kind, name, created_at, last_seen_at").eq("id", userId).maybeSingle(),
    admin.from("profiles").select("*").eq("member_id", userId).maybeSingle(),
    own("group_members"),
    own("message_reactions"),
    own("poll_votes"),
    own("notification_settings"),
    own("member_blocks"),
    own("scheduled_messages", "author_id"),
    own("uploads", "owner_id"),
    // What their edited messages said before (the edits of their own messages only).
    admin.from("message_edits").select("message_id, body, written_at, replaced_at, messages!inner(author_id)")
      .eq("messages.author_id", userId).order("id").limit(10_000),
  ]);

  // Messages, newest first, a page at a time.
  const messages: unknown[] = [];
  for (let from = 0; from < MAX_MESSAGES; from += PAGE) {
    const { data } = await admin.from("messages")
      .select("id, channel_id, thread_id, body, attachments, created_at, edited_at, deleted_at")
      .eq("author_id", userId).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    if (!data?.length) break;
    messages.push(...data);
    if (data.length < PAGE) break;
  }

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: member.data,
      profile: profile.data,
      memberships: memberships.data ?? [],
      messages,
      editHistory: (edits.data ?? []).map(({ message_id, body, written_at, replaced_at }) => ({
        message_id,
        body,
        written_at,
        replaced_at,
      })),
      reactions: reactions.data ?? [],
      pollVotes: votes.data ?? [],
      notificationSettings: notifications.data ?? [],
      blocked: blocks.data ?? [],
      scheduledMessages: scheduled.data ?? [],
      uploads: uploads.data ?? [],
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="obsidian-chat-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
