-- Obsidian Chat: custom roles. A group defines named, colored roles that grant
-- some extra permissions on top of a member's rank (owner/admin/moderator/
-- member, which still decides who acts on whom); members hold any number of
-- them. Same access model as the first migration: RLS on, no policies; only
-- the chat server (secret key) reads and writes these tables.

create table public.group_roles (
  id          text primary key check (id ~ '^[\w-]{8,64}$'),
  group_id    text not null references public.groups (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 32),
  color       text not null check (color ~ '^#[0-9a-f]{6}$'),
  -- Permission flags (see RolePermission in lib/chat/types/permissions.ts).
  permissions text[] not null default '{}' check (permissions <@ array[
    'MESSAGE:PIN', 'MESSAGE:ANNOUNCE', 'MESSAGE:MANAGE', 'MEMBER:INVITE',
    'MEMBER:MUTE', 'MEMBER:KICK', 'GROUP:MANAGE', 'GROUP:AUDIT'
  ]::text[]),
  -- Listing order within the group (the first role someone holds colors their name).
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index group_roles_group_idx on public.group_roles (group_id, position);
create unique index group_roles_name_idx on public.group_roles (group_id, lower(name));

alter table public.group_roles enable row level security;

-- The custom roles each member holds in each group (group_roles ids).
alter table public.group_members add column roles text[] not null default '{}';

-- Deleting a role takes it from everyone who held it, in one transaction.
-- Returns the deleted role's row, or nothing if it wasn't there.
create function public.delete_group_role(p_group text, p_role text)
returns setof public.group_roles
language plpgsql
set search_path = ''
as $$
begin
  update public.group_members set roles = array_remove(roles, p_role)
    where group_id = p_group and p_role = any (roles);
  return query delete from public.group_roles where group_id = p_group and id = p_role returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- The moderation log also records custom roles being made, changed, deleted
-- and handed out.
-- ---------------------------------------------------------------------------

alter table public.moderation_log drop constraint moderation_log_action_check;

alter table public.moderation_log add constraint moderation_log_action_check check (action in (
  'message_remove', 'event_update', 'message_pin', 'message_unpin',
  'member_mute', 'member_unmute', 'member_kick', 'member_ban', 'member_unban',
  'member_role', 'owner_transfer', 'member_invite', 'invite_revoke',
  'channel_create', 'channel_update', 'channel_delete', 'channel_move', 'group_update',
  'invite_link_create', 'invite_link_revoke', 'report_dismiss',
  'webhook_create', 'webhook_delete', 'emoji_add', 'emoji_remove',
  'bot_add', 'bot_remove',
  'role_create', 'role_update', 'role_delete', 'member_roles'
));
