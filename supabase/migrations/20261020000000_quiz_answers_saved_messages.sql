-- Obsidian Chat: quiz answers kept by the server, and saved messages.
-- Same access model as the first migration: RLS on, no policies; only the
-- chat server (secret key) reads and writes these tables.

-- Quiz answers: one per member per quiz, graded by the server (clients never
-- see a quiz's answer until they've answered). A message's quiz is identified
-- by its index in the message's attachments array, like poll votes.
-- `correct_index` is the right option, stored with the answer so each member's
-- result can be shown without sending the answer itself to anyone else.
create table public.quiz_answers (
  message_id    text not null references public.messages (id) on delete cascade,
  quiz_index    smallint not null check (quiz_index between 0 and 19),
  member_id     text not null references public.members (id) on delete cascade,
  option_index  smallint not null check (option_index between 0 and 9),
  correct_index smallint not null check (correct_index between 0 and 9),
  created_at    timestamptz not null default now(),
  primary key (message_id, quiz_index, member_id)
);

create index quiz_answers_member_idx on public.quiz_answers (member_id, message_id);

-- Saved messages ("save for later"): private to each member.
create table public.saved_messages (
  member_id  text not null references public.members (id) on delete cascade,
  message_id text not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, message_id)
);

create index saved_messages_recent_idx on public.saved_messages (member_id, created_at desc);

alter table public.quiz_answers   enable row level security;
alter table public.saved_messages enable row level security;
