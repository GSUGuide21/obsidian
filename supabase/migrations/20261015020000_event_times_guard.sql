-- Obsidian Chat: event_times (from the discover migration) casts `startTime`
-- only for attachments where it's a number. The cast may run before the
-- `where` filter, so without the guard a non-numeric `startTime` on any
-- attachment would make saving its message fail. Same signature, so the
-- trigger and grants carry over.

create or replace function public.event_times(p_attachments jsonb)
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
