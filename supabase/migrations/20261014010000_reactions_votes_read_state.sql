-- Obsidian Chat: reactions, shared poll votes and per-member read state.
-- Same access model as the first migration: RLS on, no policies; only the
-- chat server (secret key) reads and writes these tables.

-- Emoji reactions: one row per (message, member, emoji).
create table public.message_reactions (
  message_id text not null references public.messages (id) on delete cascade,
  member_id  text not null references public.members (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, emoji)
);

create index message_reactions_message_idx on public.message_reactions (message_id);

-- Poll votes: one choice per member per poll. A message's poll is identified
-- by its index in the message's attachments array.
create table public.poll_votes (
  message_id   text not null references public.messages (id) on delete cascade,
  poll_index   smallint not null check (poll_index between 0 and 19),
  member_id    text not null references public.members (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 9),
  created_at   timestamptz not null default now(),
  primary key (message_id, poll_index, member_id)
);

create index poll_votes_message_idx on public.poll_votes (message_id);

-- Where each member has read up to in each channel (drives unread counts and
-- the "New messages" divider across reloads and devices).
create table public.read_state (
  member_id    text not null references public.members (id) on delete cascade,
  channel_id   text not null references public.channels (id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (member_id, channel_id)
);

alter table public.message_reactions enable row level security;
alter table public.poll_votes        enable row level security;
alter table public.read_state        enable row level security;
