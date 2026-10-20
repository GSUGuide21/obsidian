-- Obsidian Chat: profiles, moderator deletions, event reminders and
-- instance administration. Same access model as before: RLS on, no
-- policies; only the chat server (secret key) reads and writes these tables.

-- ---------------------------------------------------------------------------
-- Profiles. App-wide: a bio and a cover photo (signed-in users set them in
-- their account metadata; the server copies them here so everyone sees
-- them). Per group: an optional display name, photo and bio that replace
-- the app-wide ones inside that group.
-- ---------------------------------------------------------------------------

alter table public.members
  add column bio        text check (char_length(bio) between 1 and 300),
  add column poster_url text check (char_length(poster_url) <= 2048);

alter table public.group_members
  add column display_name text check (char_length(display_name) between 1 and 32),
  add column avatar_url   text check (char_length(avatar_url) <= 2048),
  add column bio          text check (char_length(bio) between 1 and 300);

-- ---------------------------------------------------------------------------
-- Moderator deletions: who removed a message, when it wasn't its author.
-- ---------------------------------------------------------------------------

alter table public.messages
  add column deleted_by text references public.members (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Event reminders: one row per reminder time of each event attachment. The
-- server sends due ones and stamps `sent_at`, so they survive restarts and
-- go out once.
-- ---------------------------------------------------------------------------

create table public.event_reminders (
  message_id       text not null references public.messages (id) on delete cascade,
  attachment_index integer not null check (attachment_index >= 0),
  channel_id       text not null references public.channels (id) on delete cascade,
  remind_at        timestamptz not null,
  sent_at          timestamptz,
  primary key (message_id, attachment_index, remind_at)
);

create index event_reminders_due_idx on public.event_reminders (remind_at) where sent_at is null;

alter table public.event_reminders enable row level security;

-- ---------------------------------------------------------------------------
-- Instance administration (app-wide admins): bans from the whole instance
-- and settings such as its name, a notice for everyone and guest access.
-- ---------------------------------------------------------------------------

alter table public.members
  add column banned_at  timestamptz,
  add column ban_reason text check (char_length(ban_reason) between 1 and 200),
  add column banned_by  text references public.members (id) on delete set null;

create index members_banned_idx on public.members (banned_at) where banned_at is not null;

create table public.instance_settings (
  key        text primary key check (key in ('name', 'notice', 'guestsAllowed')),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text references public.members (id) on delete set null
);

alter table public.instance_settings enable row level security;
