-- Obsidian Chat: the discover page. Groups get an optional description shown
-- on their card; the server counts each group's members in one query; and
-- every event attachment gets a row with its start and end, so upcoming
-- events can be found without reading every message. Same access model as
-- before: RLS on, no policies; only the chat server (secret key) reads and writes.

alter table public.groups
  add column description text check (char_length(description) between 1 and 200);

-- ---------------------------------------------------------------------------
-- Members per group, for the discover page's cards.
-- ---------------------------------------------------------------------------

create function public.group_member_counts()
returns table (group_id text, members bigint)
language sql
stable
set search_path = ''
as $$
  select group_id, count(*) from public.group_members group by group_id;
$$;

-- ---------------------------------------------------------------------------
-- Event times: one row per event attachment of each message that isn't
-- deleted, kept in step with `messages` by a trigger.
-- ---------------------------------------------------------------------------

create table public.message_events (
  message_id       text not null references public.messages (id) on delete cascade,
  attachment_index integer not null check (attachment_index >= 0),
  channel_id       text not null references public.channels (id) on delete cascade,
  starts_at        timestamptz not null,
  -- The event's end; the end of its day when it's all-day, else its start (mirrors eventEnd in lib/chat/types.ts).
  ends_at          timestamptz not null,
  primary key (message_id, attachment_index)
);

create index message_events_channel_ends_idx on public.message_events (channel_id, ends_at);

alter table public.message_events enable row level security;

-- The events in an attachments array, with their index in it. Times in the
-- attachments are milliseconds since the epoch.
create function public.event_times(p_attachments jsonb)
returns table (attachment_index integer, starts_at timestamptz, ends_at timestamptz)
language sql
immutable
set search_path = ''
as $$
  select
    (e.idx - 1)::integer,
    to_timestamp(t.start_ms / 1000),
    to_timestamp(
      case
        when jsonb_typeof(e.a -> 'endTime') = 'number' then (e.a ->> 'endTime')::double precision
        when e.a ->> 'allDay' = 'true' then t.start_ms + 24 * 60 * 60 * 1000
        else t.start_ms
      end / 1000
    )
  from jsonb_array_elements(p_attachments) with ordinality as e(a, idx)
  -- Guarded: the cast may run before the `where` filter, and must never throw on other attachments.
  cross join lateral (
    select case when jsonb_typeof(e.a -> 'startTime') = 'number' then (e.a ->> 'startTime')::double precision end as start_ms
  ) as t
  where e.a ->> 'type' = 'event' and t.start_ms is not null;
$$;

create function public.sync_message_events()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.message_events where message_id = new.id;
  if new.deleted_at is null then
    insert into public.message_events (message_id, attachment_index, channel_id, starts_at, ends_at)
    select new.id, t.attachment_index, new.channel_id, t.starts_at, t.ends_at
    from public.event_times(new.attachments) as t;
  end if;
  return null;
end;
$$;

create trigger messages_sync_events
  after insert or update of attachments, deleted_at on public.messages
  for each row execute function public.sync_message_events();

-- Events posted before this migration.
insert into public.message_events (message_id, attachment_index, channel_id, starts_at, ends_at)
select m.id, t.attachment_index, m.channel_id, t.starts_at, t.ends_at
from public.messages as m
cross join lateral public.event_times(m.attachments) as t
where m.deleted_at is null and m.attachments @> '[{"type": "event"}]';

-- Messages in these channels with an event that hasn't ended, soonest start first.
create function public.upcoming_event_messages(p_channels text[], p_limit integer)
returns setof public.messages
language sql
stable
set search_path = ''
as $$
  select m.*
  from (
    select message_id, min(starts_at) as next_start
    from public.message_events
    where channel_id = any (p_channels) and ends_at >= now()
    group by message_id
    order by next_start
    limit p_limit
  ) as e
  join public.messages as m on m.id = e.message_id
  order by e.next_start;
$$;

-- Functions are executable by everyone by default; only the server may call these.
revoke execute on function public.group_member_counts() from public, anon, authenticated;
revoke execute on function public.event_times(jsonb) from public, anon, authenticated;
revoke execute on function public.sync_message_events() from public, anon, authenticated;
revoke execute on function public.upcoming_event_messages(text[], integer) from public, anon, authenticated;
