-- Obsidian Chat: disappearing messages per channel, the earlier versions of
-- edited messages, and sticker packs per group. Same access model as before:
-- RLS on, no policies; only the chat server (secret key) reads and writes.

-- ---------------------------------------------------------------------------
-- Disappearing messages: the server deletes a channel's messages this many
-- seconds after they were posted (see lib/server/disappearing.ts). Null: off.
-- Mirrors DISAPPEAR_TIMES in lib/chat/types/groups.ts.
-- ---------------------------------------------------------------------------

alter table public.channels
  add column disappear_after integer check (disappear_after in (3600, 86400, 604800));

-- ---------------------------------------------------------------------------
-- Edit history: each edit keeps the text it replaced, and when that text was
-- written (the message's creation, or its previous edit). Goes with the message.
-- ---------------------------------------------------------------------------

create table public.message_edits (
  id          bigint generated always as identity primary key,
  message_id  text not null references public.messages (id) on delete cascade,
  body        text not null check (char_length(body) <= 2000),
  written_at  timestamptz not null,
  replaced_at timestamptz not null default now()
);

create index message_edits_message_idx on public.message_edits (message_id, id);

alter table public.message_edits enable row level security;

-- ---------------------------------------------------------------------------
-- Sticker packs: per group, like custom emoji, but sent on their own and shown big.
-- ---------------------------------------------------------------------------

create table public.group_stickers (
  group_id   text not null references public.groups (id) on delete cascade,
  name       text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  url        text not null check (char_length(url) <= 2048),
  created_by text references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, name)
);

alter table public.group_stickers enable row level security;

-- ---------------------------------------------------------------------------
-- The moderation log also records stickers being added and removed.
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
  'role_create', 'role_update', 'role_delete', 'member_roles',
  'sticker_add', 'sticker_remove'
));
