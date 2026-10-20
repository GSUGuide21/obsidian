// Direct messages: private groups of kind "dm" with one channel.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { accessByMember, loadAccess } from "./access.ts";
import { db } from "./db.ts";
import { colorFor } from "./identity.ts";
import { groups } from "./state.ts";
import { publishStructure } from "./structure.ts";
import { newId } from "./validation.ts";

// ---------------------------------------------------------------------------
// Direct messages: private groups of kind "dm" with one channel, between
// signed-in people. Their membership is fixed when they start (people can
// leave a group DM, not a one-on-one), and nobody moderates them.
// ---------------------------------------------------------------------------

/** The direct message with exactly these people, if there is one. */
export function findDm(participants: string[]) {
  const key = [...participants].sort().join();
  return groups.find((g) => g.kind === "dm" && g.members?.join() === key);
}

/** Start a direct message between `participants`: its channel's id, or an error. */
export async function createDm(participants: string[]): Promise<{ channelId: string } | { error: string }> {
  const groupId = newId("dm", 40, "dm");
  const channelId = newId(`${groupId}-chat`, 80, "channel");
  const failed = (step: string, error: { message: string }) => {
    console.error(`dm ${step} failed:`, error.message);
    return { error: "Couldn't start the conversation. Try again." };
  };
  const { error: groupError } = await db.from("groups").insert({
    id: groupId,
    name: "Direct message", // shown as its members' names instead
    color: colorFor(groupId),
    visibility: "private",
    kind: "dm",
    position: 0,
  });
  if (groupError) return failed("insert", groupError);
  const [membersResult, channelResult] = await Promise.all([
    db.from("group_members").insert(participants.map((id) => ({ group_id: groupId, member_id: id, role: "member" }))),
    db.from("channels").insert({ id: channelId, group_id: groupId, name: "chat", type: "text", position: 0 }),
  ]);
  const error = membersResult.error ?? channelResult.error;
  if (error) {
    await db.from("groups").delete().eq("id", groupId); // its members and channel go with it
    return failed("setup", error);
  }
  // Everyone in it can read it now.
  await Promise.all(participants.filter((id) => accessByMember.has(id)).map((id) => loadAccess(id)));
  await publishStructure();
  return { channelId };
}
