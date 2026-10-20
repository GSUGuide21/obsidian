-- Obsidian Chat: profiles in their own table. `members` keeps chat identity
-- (who someone is: kind, account, name, role, bans, presence); `profiles`
-- holds how they look (avatar color and photo, bio, cover photo). Same access
-- model as before: RLS on, no policies; only the chat server reads and writes.

create table public.profiles (
  member_id  text primary key references public.members (id) on delete cascade,
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  avatar_url text check (char_length(avatar_url) <= 2048),
  bio        text check (char_length(bio) between 1 and 300),
  poster_url text check (char_length(poster_url) <= 2048),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Move everyone's existing profile over (the starter bot included).
insert into public.profiles (member_id, color, avatar_url, bio, poster_url)
select id, color, avatar_url, bio, poster_url from public.members;

alter table public.members
  drop column color,
  drop column avatar_url,
  drop column bio,
  drop column poster_url;
