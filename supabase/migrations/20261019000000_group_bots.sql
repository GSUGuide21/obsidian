-- Obsidian Chat: group bots, outside services that answer slash commands.
-- Same access model as before: RLS on, no policies; only the chat server
-- (secret key) reads and writes.

-- ---------------------------------------------------------------------------
-- A bot posts as a bot member of its own ('bot-<id>'), which outlives it (old
-- messages keep the name). The server signs what it sends the bot with
-- `secret` (HMAC-SHA256), so unlike a webhook token it's kept as is: signing
-- needs it, and it only ever leaves the server once, when the bot is added.
-- `commands` is what the bot declared, as the server cleaned it.
-- ---------------------------------------------------------------------------

create table public.group_bots (
  id         text primary key check (id ~ '^[a-z0-9]{12}$'),
  group_id   text not null references public.groups (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 32),
  url        text not null check (url ~ '^https://' and char_length(url) <= 2048),
  secret     text not null check (secret ~ '^[A-Za-z0-9_-]{32,64}$'),
  commands   jsonb not null default '[]'::jsonb
             check (jsonb_typeof(commands) = 'array' and jsonb_array_length(commands) <= 25),
  created_by text references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index group_bots_group_idx on public.group_bots (group_id);

alter table public.group_bots enable row level security;

-- ---------------------------------------------------------------------------
-- The moderation log also records bots being added and removed.
-- ---------------------------------------------------------------------------

alter table public.moderation_log drop constraint moderation_log_action_check;

alter table public.moderation_log add constraint moderation_log_action_check check (action in (
  'message_remove', 'event_update', 'message_pin', 'message_unpin',
  'member_mute', 'member_unmute', 'member_kick', 'member_ban', 'member_unban',
  'member_role', 'owner_transfer', 'member_invite', 'invite_revoke',
  'channel_create', 'channel_update', 'channel_delete', 'channel_move', 'group_update',
  'invite_link_create', 'invite_link_revoke', 'report_dismiss',
  'webhook_create', 'webhook_delete', 'emoji_add', 'emoji_remove',
  'bot_add', 'bot_remove'
));
