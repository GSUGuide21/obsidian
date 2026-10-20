-- Obsidian Chat: group membership, roles, mutes, bans, invites and private groups.
-- Same access model as before: RLS on, no policies; only the chat server
-- (secret key) reads and writes these tables.

-- ---------------------------------------------------------------------------
-- Visibility. Public groups are listed for everyone and anyone (not banned)
-- can read and post; posting joins them. Private groups are only listed for
-- their members (and people invited to them) and need an invite to join.
-- ---------------------------------------------------------------------------

alter table public.groups
  add column visibility text not null default 'public' check (visibility in ('public', 'private'));

-- ---------------------------------------------------------------------------
-- Members of each group and their role there. Each group has at most one
-- owner (groups created before this migration have none; app-wide admins
-- manage them as group admins). Make someone the owner with:
--   insert into public.group_members (group_id, member_id, role)
--   values ('<group id>', '<member id>', 'owner')
--   on conflict (group_id, member_id) do update set role = 'owner';
-- ---------------------------------------------------------------------------

create table public.group_members (
  group_id    text not null references public.groups (id) on delete cascade,
  member_id   text not null references public.members (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  -- Can't post in the group until then.
  muted_until timestamptz,
  joined_at   timestamptz not null default now(),
  primary key (group_id, member_id)
);

create unique index group_members_one_owner_idx on public.group_members (group_id) where role = 'owner';
create index group_members_member_idx on public.group_members (member_id);

-- Banned people can't see, join or post in the group until `until` (forever when null).
create table public.group_bans (
  group_id   text not null references public.groups (id) on delete cascade,
  member_id  text not null references public.members (id) on delete cascade,
  banned_by  text references public.members (id) on delete set null,
  reason     text check (char_length(reason) between 1 and 200),
  until      timestamptz,
  created_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create index group_bans_member_idx on public.group_bans (member_id);

-- Pending invites to private groups; removed when the invitee joins.
create table public.group_invites (
  group_id   text not null references public.groups (id) on delete cascade,
  member_id  text not null references public.members (id) on delete cascade,
  invited_by text references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create index group_invites_member_idx on public.group_invites (member_id);

alter table public.group_members enable row level security;
alter table public.group_bans    enable row level security;
alter table public.group_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Ownership transfer in one transaction: the owner becomes an admin and the
-- new owner takes over (two updates would trip the one-owner index between).
-- Returns false if `from` isn't the owner or `to` isn't a member.
-- ---------------------------------------------------------------------------

create function public.transfer_group_owner(p_group text, p_from text, p_to text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.group_members where group_id = p_group and member_id = p_to
  ) then
    return false;
  end if;
  update public.group_members set role = 'admin'
    where group_id = p_group and member_id = p_from and role = 'owner';
  if not found then
    return false;
  end if;
  update public.group_members set role = 'owner'
    where group_id = p_group and member_id = p_to;
  return true;
end;
$$;

-- Functions are executable by everyone by default; only the server may call this.
revoke execute on function public.transfer_group_owner(text, text, text) from public, anon, authenticated;
