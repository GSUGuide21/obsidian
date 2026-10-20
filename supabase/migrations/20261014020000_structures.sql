-- Obsidian Chat: channel categories, admins, threads, pins and wiki pages.
-- Same access model as before: RLS on, no policies; only the chat server
-- (secret key) reads and writes these tables.

-- ---------------------------------------------------------------------------
-- Channel categories: sidebar sections within a group. Channels without one
-- are listed first, then each category in order of its first channel.
-- ---------------------------------------------------------------------------

alter table public.channels
  add column category text check (char_length(category) between 1 and 40);

-- ---------------------------------------------------------------------------
-- Roles. Only admins (and bots) can post top-level messages in announcement
-- channels; everyone can still react and reply in threads. Grant with:
--   update public.members set role = 'admin' where id = '<auth user id>';
-- ---------------------------------------------------------------------------

alter table public.members
  add column role text not null default 'member' check (role in ('member', 'admin'));

-- ---------------------------------------------------------------------------
-- Threads: a reply in a thread points at its root message and never shows in
-- the channel itself. The root keeps a summary (count, last reply, a few
-- recent participants) so channel history doesn't have to aggregate.
-- ---------------------------------------------------------------------------

alter table public.messages
  add column thread_id           text references public.messages (id) on delete cascade,
  add column thread_count        integer not null default 0 check (thread_count >= 0),
  add column thread_last_at      timestamptz,
  add column thread_participants text[] not null default '{}',
  add column pinned_at           timestamptz,
  add column pinned_by           text references public.members (id) on delete set null;

create index messages_thread_idx on public.messages (thread_id, created_at desc)
  where thread_id is not null;

-- Channel history only reads top-level messages.
create index messages_channel_top_idx on public.messages (channel_id, created_at desc, id desc)
  where thread_id is null;

create index messages_pinned_idx on public.messages (channel_id, pinned_at desc)
  where pinned_at is not null;

-- ---------------------------------------------------------------------------
-- Wiki pages: one Markdown page per wiki channel. `version` increments on
-- every save so concurrent edits are detected instead of overwritten.
-- ---------------------------------------------------------------------------

create table public.channel_pages (
  channel_id text primary key references public.channels (id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 20000),
  version    integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by text references public.members (id) on delete set null
);

alter table public.channel_pages enable row level security;

-- ---------------------------------------------------------------------------
-- Seed: categories for the starter channels and a handbook wiki.
-- ---------------------------------------------------------------------------

update public.channels set category = 'Chat' where id in ('hq-general', 'hq-random');
update public.channels set category = 'Info' where id = 'hq-announcements';
update public.channels set category = 'Teams' where id in ('eng-frontend', 'eng-backend');
update public.channels set category = 'Ops' where id = 'eng-deploys';

insert into public.channels (id, group_id, name, topic, type, category, position) values
  ('hq-handbook', 'hq', 'handbook', 'How we work', 'wiki', 'Info', 3)
on conflict (id) do nothing;

insert into public.channel_pages (channel_id, body, updated_by) values
  ('hq-handbook', E'# Handbook\n\nThis is a wiki channel: one shared page anyone signed in can edit, with a chat tab for discussing it.\n\n## Channels\n\n- **#general** for everyday conversation\n- **#announcements** for news from admins (reply in threads)\n- **#random** for anything else\n\n## Etiquette\n\n1. Use threads to keep side conversations together.\n2. Pin messages people will need again.', 'obsidian')
on conflict (channel_id) do nothing;
