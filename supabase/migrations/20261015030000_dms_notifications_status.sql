-- Obsidian Chat: direct messages, notification settings, statuses and
-- message search. Same access model as before: RLS on, no policies; only the
-- chat server (secret key) reads and writes.

-- ---------------------------------------------------------------------------
-- Direct messages: private groups of kind 'dm' with one channel, whose members
-- are the conversation's participants. Only participants can read them (app-wide
-- admins included: there's no admin override for DMs).
-- ---------------------------------------------------------------------------

alter table public.groups
  add column kind text not null default 'group' check (kind in ('group', 'dm'));

create index groups_dm_idx on public.groups (kind) where kind = 'dm';

-- ---------------------------------------------------------------------------
-- Notification settings: per member, for a group or a channel (`target_id`).
-- A channel's setting wins over its group's; without either, groups notify
-- for mentions and replies, DMs for every message.
-- ---------------------------------------------------------------------------

create table public.notification_settings (
  member_id  text not null references public.members (id) on delete cascade,
  target_id  text not null check (char_length(target_id) between 1 and 80),
  level      text not null check (level in ('all', 'mentions', 'none')),
  updated_at timestamptz not null default now(),
  primary key (member_id, target_id)
);

alter table public.notification_settings enable row level security;

-- ---------------------------------------------------------------------------
-- Statuses: the presence someone picked (shown while they're connected;
-- 'invisible' shows them offline) and a custom status that may clear itself.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column presence          text not null default 'online' check (presence in ('online', 'away', 'dnd', 'invisible')),
  add column status_text       text check (char_length(status_text) between 1 and 80),
  add column status_emoji      text check (char_length(status_emoji) between 1 and 16),
  add column status_expires_at timestamptz;

-- ---------------------------------------------------------------------------
-- Search: substring matches on message text (`body ilike '%word%'`), served
-- by a trigram index.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

create index messages_body_trgm_idx on public.messages using gin (body extensions.gin_trgm_ops);
