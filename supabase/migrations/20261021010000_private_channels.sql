-- Obsidian Chat: private channels. A private channel is only seen by the
-- group's owner, admins and moderators, whoever can manage its channels, and the custom
-- roles and members it lets in (see canSeeChannel in lib/server/access.ts).
-- Everyone else doesn't get it at all: not in their sidebar, search, unread
-- counts or live events. Mirrors MAX_CHANNEL_MEMBERS in lib/chat/types/groups.ts.

alter table public.channels
  add column private boolean not null default false,
  -- Custom role ids (group_roles.id) let in.
  add column allowed_roles text[] not null default '{}',
  -- Member ids let in, on top of the roles.
  add column allowed_members text[] not null default '{}'
    check (cardinality(allowed_members) <= 100);
