-- Obsidian Chat: the moderation log. Each moderation action in a group (mutes,
-- kicks, bans, role changes, removed messages, …) is recorded with who did it,
-- to whom, and a snapshot of what it changed (see ModerationRecord in
-- lib/chat/types/moderation.ts). Removed messages lose their content, so the
-- snapshot is the only record of it. Same access model as before: RLS on, no
-- policies; only the chat server (secret key) reads and writes.

create table public.moderation_log (
  id         bigint generated always as identity primary key,
  group_id   text not null references public.groups (id) on delete cascade,
  -- Kept when accounts are deleted, so the entry stays (without the name).
  actor_id   text references public.members (id) on delete set null,
  target_id  text references public.members (id) on delete set null,
  action     text not null check (action in (
    'message_remove', 'event_update', 'message_pin', 'message_unpin',
    'member_mute', 'member_unmute', 'member_kick', 'member_ban', 'member_unban',
    'member_role', 'owner_transfer', 'member_invite', 'invite_revoke'
  )),
  -- The record's other fields, validated by the server before insert.
  snapshot   jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

-- A group's log, newest first, paged by id.
create index moderation_log_group_idx on public.moderation_log (group_id, id desc);

alter table public.moderation_log enable row level security;
