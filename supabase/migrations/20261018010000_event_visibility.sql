-- Obsidian Chat: event visibility. The discover page only lists events marked
-- public ("visibility": "public" on the attachment) that aren't cancelled, and
-- only from public groups (the server passes just those groups' channels).
-- Same access model as before: RLS on, no policies.

alter table public.message_events
  add column listed boolean not null default false;

-- Same as before, plus whether each event is listed. The trigger carries over.
create or replace function public.sync_message_events()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.message_events where message_id = new.id;
  if new.deleted_at is null then
    insert into public.message_events (message_id, attachment_index, channel_id, starts_at, ends_at, listed)
    select
      new.id, t.attachment_index, new.channel_id, t.starts_at, t.ends_at,
      coalesce(
        (new.attachments -> t.attachment_index ->> 'visibility') = 'public'
          and (new.attachments -> t.attachment_index ->> 'cancelled') is distinct from 'true',
        false
      )
    from public.event_times(new.attachments) as t;
  end if;
  return null;
end;
$$;

-- Events posted before this migration have no visibility, so they stay unlisted;
-- this only matters if any were already marked public.
update public.message_events as e
set listed = coalesce(
  (m.attachments -> e.attachment_index ->> 'visibility') = 'public'
    and (m.attachments -> e.attachment_index ->> 'cancelled') is distinct from 'true',
  false
)
from public.messages as m
where m.id = e.message_id;

-- Only listed events now.
create or replace function public.upcoming_event_messages(p_channels text[], p_limit integer)
returns setof public.messages
language sql
stable
set search_path = ''
as $$
  select m.*
  from (
    select message_id, min(starts_at) as next_start
    from public.message_events
    where channel_id = any (p_channels) and ends_at >= now() and listed
    group by message_id
    order by next_start
    limit p_limit
  ) as e
  join public.messages as m on m.id = e.message_id
  order by e.next_start;
$$;

revoke execute on function public.sync_message_events() from public, anon, authenticated;
revoke execute on function public.upcoming_event_messages(text[], integer) from public, anon, authenticated;
