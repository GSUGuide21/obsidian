-- Obsidian Chat: scheduled messages, incoming webhooks and custom emoji.
-- Same access model as before: RLS on, no policies; only the chat server
-- (secret key) reads and writes.

-- ---------------------------------------------------------------------------
-- Scheduled messages: posted by the server at `send_at`, checked again then
-- (the author may have been muted or lost access since). A row is claimed by
-- setting `sent_at`, so each goes out once; `failure` says why one couldn't.
-- ---------------------------------------------------------------------------

create table public.scheduled_messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  text not null references public.channels (id) on delete cascade,
  author_id   text not null references public.members (id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 2000),
  attachments jsonb not null default '[]'::jsonb
              check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 20),
  send_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  failure     text check (char_length(failure) <= 300)
);

create index scheduled_messages_due_idx on public.scheduled_messages (send_at) where sent_at is null;
create index scheduled_messages_author_idx on public.scheduled_messages (author_id, channel_id);

alter table public.scheduled_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Incoming webhooks: a secret URL that posts into one channel as a bot
-- member ('webhook-<id>'). Only a hash of the token is kept.
-- ---------------------------------------------------------------------------

create table public.channel_webhooks (
  id         text primary key check (id ~ '^[a-z0-9]{12}$'),
  channel_id text not null references public.channels (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 32),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by text references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index channel_webhooks_channel_idx on public.channel_webhooks (channel_id);

alter table public.channel_webhooks enable row level security;

-- ---------------------------------------------------------------------------
-- Custom emoji: per group, used as :name: in messages and reactions.
-- ---------------------------------------------------------------------------

create table public.group_emoji (
  group_id   text not null references public.groups (id) on delete cascade,
  name       text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  url        text not null check (char_length(url) <= 2048),
  created_by text references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, name)
);

alter table public.group_emoji enable row level security;

-- ---------------------------------------------------------------------------
-- The moderation log also records webhooks and custom emoji changes.
-- ---------------------------------------------------------------------------

alter table public.moderation_log drop constraint moderation_log_action_check;

alter table public.moderation_log add constraint moderation_log_action_check check (action in (
  'message_remove', 'event_update', 'message_pin', 'message_unpin',
  'member_mute', 'member_unmute', 'member_kick', 'member_ban', 'member_unban',
  'member_role', 'owner_transfer', 'member_invite', 'invite_revoke',
  'channel_create', 'channel_update', 'channel_delete', 'channel_move', 'group_update',
  'invite_link_create', 'invite_link_revoke', 'report_dismiss',
  'webhook_create', 'webhook_delete', 'emoji_add', 'emoji_remove'
));
