-- Obsidian Chat: push notifications, invite links, message reports and
-- blocking. Same access model as before: RLS on, no policies; only the chat
-- server (secret key) reads and writes.

-- ---------------------------------------------------------------------------
-- Push subscriptions: one per browser/device that turned push on. The server
-- pushes to people with no tab open (see notifyAbout in server.mts) and drops
-- subscriptions the push service says are gone.
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  endpoint   text primary key check (char_length(endpoint) between 1 and 2048),
  member_id  text not null references public.members (id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) between 1 and 256),
  auth       text not null check (char_length(auth) between 1 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- Invite links: anyone with the link can join the group (private ones too),
-- until it expires, runs out of uses or is revoked.
-- ---------------------------------------------------------------------------

create table public.group_invite_links (
  code       text primary key check (code ~ '^[A-Za-z0-9_-]{8,32}$'),
  group_id   text not null references public.groups (id) on delete cascade,
  created_by text references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  -- null: never expires.
  expires_at timestamptz,
  -- null: unlimited.
  max_uses   integer check (max_uses > 0),
  uses       integer not null default 0 check (uses >= 0),
  revoked_at timestamptz
);

create index group_invite_links_group_idx on public.group_invite_links (group_id, created_at desc);

alter table public.group_invite_links enable row level security;

-- Count one use of a link if it's still good, atomically (so a link with one
-- use left can't be used twice at once). Returns its group, or null.
create function public.use_invite_link(p_code text)
returns text
language sql
set search_path = ''
as $$
  update public.group_invite_links
  set uses = uses + 1
  where code = p_code
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses < max_uses)
  returning group_id;
$$;

revoke execute on function public.use_invite_link(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Message reports: members flag a message for the group's moderators. The
-- message is snapshotted, so the report survives the message being removed.
-- ---------------------------------------------------------------------------

create table public.message_reports (
  id          bigint generated always as identity primary key,
  group_id    text not null references public.groups (id) on delete cascade,
  message_id  text not null,
  reporter_id text references public.members (id) on delete set null,
  author_id   text references public.members (id) on delete set null,
  reason      text check (char_length(reason) <= 500),
  -- The message as it was (see MessageSnapshot in lib/chat/types/moderation.ts).
  snapshot    jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text references public.members (id) on delete set null,
  resolution  text check (resolution in ('dismissed', 'removed')),
  check ((resolved_at is null) = (resolution is null))
);

-- Open reports per group, newest first.
create index message_reports_open_idx on public.message_reports (group_id, id desc) where resolved_at is null;
-- One open report per person per message.
create unique index message_reports_once_idx on public.message_reports (message_id, reporter_id) where resolved_at is null;

alter table public.message_reports enable row level security;

-- ---------------------------------------------------------------------------
-- Blocks: one member blocking another. Blocked people's messages are hidden
-- from the blocker, they don't notify them, and neither can start a direct
-- message with the other.
-- ---------------------------------------------------------------------------

create table public.member_blocks (
  member_id  text not null references public.members (id) on delete cascade,
  blocked_id text not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, blocked_id),
  check (member_id <> blocked_id)
);

create index member_blocks_blocked_idx on public.member_blocks (blocked_id);

alter table public.member_blocks enable row level security;

-- ---------------------------------------------------------------------------
-- The moderation log also records invite links and handled reports.
-- ---------------------------------------------------------------------------

alter table public.moderation_log drop constraint moderation_log_action_check;

alter table public.moderation_log add constraint moderation_log_action_check check (action in (
  'message_remove', 'event_update', 'message_pin', 'message_unpin',
  'member_mute', 'member_unmute', 'member_kick', 'member_ban', 'member_unban',
  'member_role', 'owner_transfer', 'member_invite', 'invite_revoke',
  'channel_create', 'channel_update', 'channel_delete', 'channel_move', 'group_update',
  'invite_link_create', 'invite_link_revoke', 'report_dismiss'
));
