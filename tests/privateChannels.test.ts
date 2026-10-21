import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GroupRole } from "../lib/chat/types/groups.ts";
import { letsIn } from "../lib/chat/types/permissions.ts";

const roles: GroupRole[] = [
  { id: "mods", name: "Mods", color: "#000000", permissions: ["GROUP:MANAGE"] },
  { id: "crew", name: "Crew", color: "#000000", permissions: [] },
];
const access = { roles: ["crew"], members: ["guest-of-honour"] };

describe("letsIn", () => {
  it("lets everyone into public channels", () => {
    assert.equal(letsIn(undefined, "anyone", undefined, roles), true);
  });

  it("lets in the owner, admins, moderators and anyone who manages channels", () => {
    assert.equal(letsIn(access, "o", { role: "owner" }, roles), true);
    assert.equal(letsIn(access, "a", { role: "admin" }, roles), true);
    assert.equal(letsIn(access, "mod", { role: "moderator" }, roles), true);
    assert.equal(letsIn(access, "m", { role: "member", roles: ["mods"] }, roles), true);
  });

  it("lets in the roles and people it names", () => {
    assert.equal(letsIn(access, "c", { role: "member", roles: ["crew"] }, roles), true);
    assert.equal(letsIn(access, "guest-of-honour", { role: "member" }, roles), true);
  });

  it("keeps everyone else out, and anyone not in the group", () => {
    assert.equal(letsIn(access, "x", { role: "member" }, roles), false);
    assert.equal(letsIn(access, "guest-of-honour", undefined, roles), false);
  });
});
