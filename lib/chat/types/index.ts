// Shared between the socket server (server.mts) and the client.
// server.mts runs through Node's type stripping, so it may only `import type`
// from here. The limits in these files are mirrored in server.mts.
//
// Import from "@/lib/chat/types"; the files are only how it's organized:
//   users        people, presence and group member records
//   permissions  group roles, permission flags and the guards built on them
//   groups       groups, channels, notifications and the discover page
//   bots         group bots and the requests they answer
//   attachments  what messages carry (media, polls, events, …) and uploads
//   messages     messages and the pages of them the server sends
//   moderation   the moderation log: who did what, with snapshots
//   calls        voice and video calls
//   instance     instance-wide settings and bans
//   events       the socket protocol: the session snapshot and every event

export * from "./users";
export * from "./permissions";
export * from "./groups";
export * from "./bots";
export * from "./attachments";
export * from "./messages";
export * from "./moderation";
export * from "./calls";
export * from "./instance";
export * from "./events";
