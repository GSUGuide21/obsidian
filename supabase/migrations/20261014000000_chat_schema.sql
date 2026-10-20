-- Obsidian Chat: persistent storage.
--
-- Access model: the chat server (server.mts and the /api routes) is the only
-- reader and writer, using the secret key, which bypasses Row Level Security.
-- RLS is enabled on every table WITH NO POLICIES, so the publishable key that
-- ships to browsers can't read or write any of this directly. Add policies
-- later only if the browser should query Supabase itself.

-- ---------------------------------------------------------------------------
-- Groups and channels
-- ---------------------------------------------------------------------------

create type public.channel_type as enum ('text', 'announcement', 'wiki');

create table public.groups (
  id         text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name       text not null check (char_length(name) between 1 and 64),
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  type       public.channel_type not null default 'text',
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.channels (
  id         text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  group_id   text not null references public.groups (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 64),
  topic      text check (char_length(topic) <= 200),
  type       public.channel_type not null default 'text',
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index channels_group_position_idx on public.channels (group_id, position);

-- ---------------------------------------------------------------------------
-- Members: signed-in users, guests and bots
-- ---------------------------------------------------------------------------

create table public.members (
  -- Signed-in: their auth user id. Guests: 'guest-…'. Bots: e.g. 'obsidian'.
  id           text primary key check (char_length(id) between 1 and 80),
  kind         text not null check (kind in ('user', 'guest', 'bot')),
  -- Deleting a Supabase account deletes its member row (messages keep, authorless).
  auth_user_id uuid unique references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 32),
  color        text not null check (color ~ '^#[0-9a-f]{6}$'),
  avatar_url   text check (char_length(avatar_url) <= 2048),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check ((kind = 'user') = (auth_user_id is not null))
);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

create table public.messages (
  -- Client-generated so retries are idempotent (see message:send).
  id          text primary key check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  channel_id  text not null references public.channels (id) on delete cascade,
  -- null once the author's account is deleted.
  author_id   text references public.members (id) on delete set null,
  body        text not null default '' check (char_length(body) <= 2000),
  -- Validated by the server before insert (see sanitizeAttachments).
  attachments jsonb not null default '[]'::jsonb
              check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 20),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz
);

-- History pages: newest first within a channel, keyset-paginated.
create index messages_channel_created_idx on public.messages (channel_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- Uploads (files live in the "uploads" Storage bucket; this tracks owners)
-- ---------------------------------------------------------------------------

create table public.uploads (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text references public.members (id) on delete set null,
  object_path  text not null unique,
  name         text not null check (char_length(name) between 1 and 120),
  content_type text not null,
  size         bigint not null check (size > 0 and size <= 26214400),
  created_at   timestamptz not null default now()
);

create index uploads_owner_idx on public.uploads (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Lock everything down: RLS on, no policies => browsers get nothing.
-- ---------------------------------------------------------------------------

alter table public.groups   enable row level security;
alter table public.channels enable row level security;
alter table public.members  enable row level security;
alter table public.messages enable row level security;
alter table public.uploads  enable row level security;

-- ---------------------------------------------------------------------------
-- Storage bucket. Public READ by URL (served from *.supabase.co, a different
-- origin, so an uploaded SVG/HTML file can't script the chat app). No
-- storage.objects policies, so only the server (secret key) can upload.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', true, 26214400)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: the channels and bot the app currently creates in memory.
-- ---------------------------------------------------------------------------

insert into public.groups (id, name, color, position) values
  ('hq',     'Obsidian HQ', '#7c3aed', 0),
  ('design', 'Design',      '#db2777', 1),
  ('eng',    'Engineering', '#0d9488', 2)
on conflict (id) do nothing;

insert into public.channels (id, group_id, name, topic, type, position) values
  ('hq-general',       'hq',     'general',       'Say hi and hang out',     'text',         0),
  ('hq-announcements', 'hq',     'announcements', 'News and updates',        'announcement', 1),
  ('hq-random',        'hq',     'random',        'Anything goes',           'text',         2),
  ('design-ui',        'design', 'ui-kit',        'Components and patterns', 'text',         0),
  ('design-feedback',  'design', 'feedback',      'Share work, get notes',   'text',         1),
  ('eng-frontend',     'eng',    'frontend',      null,                      'text',         0),
  ('eng-backend',      'eng',    'backend',       null,                      'text',         1),
  ('eng-deploys',      'eng',    'deploys',       'Ship log',                'text',         2)
on conflict (id) do nothing;

insert into public.members (id, kind, name, color) values
  ('obsidian', 'bot', 'Obsidian', '#7c3aed')
on conflict (id) do nothing;

insert into public.messages (id, channel_id, author_id, body) values
  ('seed-welcome-general',       'hq-general',       'obsidian', 'Welcome to #general! Introduce yourself 👋'),
  ('seed-welcome-announcements', 'hq-announcements', 'obsidian', 'Obsidian Chat is live. Pick a channel on the left and start talking.')
on conflict (id) do nothing;
