-- Obsidian Chat: finding people. Discover's People tab lists signed-in members
-- (see "people:list"); each can leave themselves out of it (Settings → Privacy).
-- On by default, like being listed in a group's members.

alter table public.profiles
  add column discoverable boolean not null default true;
