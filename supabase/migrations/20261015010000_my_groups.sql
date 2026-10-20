-- Obsidian Chat: the sidebar lists only the groups you're in, in your own
-- order. Same access model as before: RLS on, no policies; only the chat
-- server (secret key) reads and writes.

-- Where the group sits in this member's sidebar; null for groups they haven't
-- placed (listed after the placed ones, oldest join first).
alter table public.group_members
  add column position integer check (position >= 0);

-- Until now everyone saw every public group. Keep the ones people actually
-- used: whoever has opened a channel of a public group (and isn't banned from
-- it) joins it.
insert into public.group_members (group_id, member_id, role)
select distinct c.group_id, rs.member_id, 'member'
from public.read_state as rs
join public.channels as c on c.id = rs.channel_id
join public.groups as g on g.id = c.group_id
where g.visibility = 'public'
  and not exists (
    select 1 from public.group_bans as b
    where b.group_id = c.group_id and b.member_id = rs.member_id
      and (b.until is null or b.until > now())
  )
on conflict (group_id, member_id) do nothing;

-- Start everyone's order from the shared one admins set so far.
update public.group_members as gm
set position = o.position
from (
  select gm2.group_id, gm2.member_id,
         (row_number() over (partition by gm2.member_id order by g.position, g.created_at) - 1)::integer as position
  from public.group_members as gm2
  join public.groups as g on g.id = gm2.group_id
) as o
where gm.group_id = o.group_id and gm.member_id = o.member_id;
