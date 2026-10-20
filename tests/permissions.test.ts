import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAnnounce,
  canBan,
  canDeleteGroup,
  canInvite,
  canJoinGroup,
  canLeave,
  canManageGroup,
  canManageMessages,
  canModerate,
  canMute,
  canPin,
  canReviewReports,
  canSetRole,
  canTransfer,
  canView,
  canViewModerationLog,
  groupRole,
  hasPermission,
  isMemberRole,
  outranks,
  roleOf,
  type MemberRole,
  type Permission,
} from "../lib/chat/types/permissions.ts";

const ROLES: MemberRole[] = ["member", "moderator", "admin", "owner"];

/** Who gets each flag, lowest role first: the table the app promises. */
const EXPECTED: Record<Exclude<Permission, "ADMINISTRATOR" | "OWNER">, MemberRole> = {
  "MESSAGE:READ": "member",
  "MESSAGE:WRITE": "member",
  "MESSAGE:REACT": "member",
  "MESSAGE:EDIT": "member",
  "MESSAGE:DELETE": "member",
  "MESSAGE:PIN": "moderator",
  "MESSAGE:MANAGE": "moderator",
  "MEMBER:INVITE": "moderator",
  "MEMBER:MUTE": "moderator",
  "MEMBER:KICK": "moderator",
  "MESSAGE:ANNOUNCE": "admin",
  "MEMBER:BAN": "admin",
  "MEMBER:MANAGE": "admin",
  "GROUP:EDIT": "admin",
  "GROUP:MANAGE": "admin",
  "GROUP:AUDIT": "admin",
  "GROUP:DELETE": "owner",
  "GROUP:TRANSFER": "owner",
};

describe("role permissions", () => {
  for (const [permission, lowest] of Object.entries(EXPECTED)) {
    it(`${permission} starts at ${lowest}`, () => {
      for (const role of ROLES) {
        const expected = ROLES.indexOf(role) >= ROLES.indexOf(lowest);
        assert.equal(hasPermission(role, permission as Permission), expected, `${role} ${permission}`);
      }
    });
  }

  it("ADMINISTRATOR and OWNER are the owner's alone", () => {
    for (const flag of ["ADMINISTRATOR", "OWNER"] as const) {
      assert.deepEqual(ROLES.filter((role) => hasPermission(role, flag)), ["owner"]);
    }
  });

  it("not being a member grants nothing", () => {
    assert.equal(hasPermission(undefined, "MESSAGE:READ"), false);
  });

  it("recognizes roles and nothing else", () => {
    for (const role of ROLES) assert.equal(isMemberRole(role), true);
    for (const value of ["Owner", "bot", "", null, 3, "toString", "__proto__"]) assert.equal(isMemberRole(value), false);
  });
});

describe("rank", () => {
  it("orders owner > admin > moderator > member", () => {
    assert.equal(outranks("owner", "admin"), true);
    assert.equal(outranks("admin", "moderator"), true);
    assert.equal(outranks("moderator", "member"), true);
    assert.equal(outranks("admin", "admin"), false);
    assert.equal(outranks("member", "owner"), false);
  });

  it("moderation only reaches members ranked below", () => {
    assert.equal(canModerate("moderator", "member"), true);
    assert.equal(canModerate("moderator", "moderator"), false);
    assert.equal(canModerate("member", "member"), false);
    assert.equal(canMute("moderator", "member"), true);
    assert.equal(canMute("moderator", "admin"), false);
    assert.equal(canManageMessages("moderator", "member"), true);
    assert.equal(canManageMessages("admin", "owner"), false);
  });

  it("bans need admin and a lower target", () => {
    assert.equal(canBan("moderator", "member"), false);
    assert.equal(canBan("admin", "moderator"), true);
    assert.equal(canBan("admin", "admin"), false);
  });

  it("roles only go to lower members, and only below your own", () => {
    assert.equal(canSetRole("admin", "member", "moderator"), true);
    assert.equal(canSetRole("admin", "member", "admin"), false);
    assert.equal(canSetRole("owner", "moderator", "admin"), true);
    assert.equal(canSetRole("moderator", "member", "member"), false);
  });

  it("only the owner transfers ownership, and not to themselves", () => {
    assert.equal(canTransfer("owner", "a", "b"), true);
    assert.equal(canTransfer("owner", "a", "a"), false);
    assert.equal(canTransfer("admin", "a", "b"), false);
  });

  it("the owner can't leave", () => {
    assert.equal(canLeave("owner"), false);
    assert.equal(canLeave("admin"), true);
  });
});

describe("guards", () => {
  it("announcements: owner, admins and bots", () => {
    assert.equal(canAnnounce("admin", { role: "member" }), true);
    assert.equal(canAnnounce("owner", { role: "member" }), true);
    assert.equal(canAnnounce("moderator", { role: "member" }), false);
    assert.equal(canAnnounce(undefined, { role: "bot" }), true);
  });

  it("pins: moderators and up, anyone in a direct message", () => {
    assert.equal(canPin("member", false), false);
    assert.equal(canPin("moderator", false), true);
    assert.equal(canPin("member", true), true);
    assert.equal(canPin(undefined, true), false);
  });

  it("invites, reports, the log and deleting", () => {
    assert.equal(canInvite("member"), false);
    assert.equal(canInvite("moderator"), true);
    assert.equal(canReviewReports("moderator"), true);
    assert.equal(canReviewReports("member"), false);
    assert.equal(canViewModerationLog("moderator"), false);
    assert.equal(canViewModerationLog("admin"), true);
    assert.equal(canDeleteGroup("admin"), false);
    assert.equal(canDeleteGroup("owner"), true);
  });

  it("app admins act as group admins, except in direct messages", () => {
    const admin = { role: "admin" as const };
    assert.equal(groupRole({ kind: undefined, role: "member" }, admin), "admin");
    assert.equal(groupRole({ kind: undefined, role: "owner" }, admin), "owner");
    assert.equal(groupRole({ kind: "dm", role: "member" }, admin), "member");
    assert.equal(canManageGroup({ kind: undefined }, admin), true);
    assert.equal(canManageGroup({ kind: "dm", role: "owner" }, admin), false);
    assert.equal(canManageGroup({ kind: undefined, role: "moderator" }, { role: "member" }), false);
  });

  it("roleOf reads the member list the same way", () => {
    const user = { id: "u", name: "U", role: "member" as const, status: "online" as const, color: "#000000" };
    const members = [{ user, role: "moderator" as const }];
    assert.equal(roleOf(members, user), "moderator");
    assert.equal(roleOf([], user), undefined);
    assert.equal(roleOf([], { ...user, role: "admin" }), "admin");
    assert.equal(roleOf([], { ...user, role: "admin" }, true), undefined);
  });

  it("private groups need membership to see and an invite to join", () => {
    assert.equal(canView("public", false), true);
    assert.equal(canView("private", false), false);
    assert.equal(canView("private", true), true);
    assert.equal(canJoinGroup("public", { banned: false, invited: false }), true);
    assert.equal(canJoinGroup("private", { banned: false, invited: false }), false);
    assert.equal(canJoinGroup("private", { banned: false, invited: true }), true);
    assert.equal(canJoinGroup("public", { banned: true, invited: true }), false);
  });
});
