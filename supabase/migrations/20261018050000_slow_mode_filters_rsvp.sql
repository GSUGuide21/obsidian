-- Obsidian Chat: slow mode per channel, a blocked-words list per group, and
-- RSVPs to events. Same access model as before: RLS on, no policies; only the
-- chat server (secret key) reads and writes.

-- Seconds between messages from each member who doesn't moderate the group (0: off).
alter table public.channels
  add column slow_mode integer not null default 0 check (slow_mode between 0 and 21600);

-- Words and phrases members' messages can't contain (lowercase; moderators are
-- exempt). Only the group's managers see the list.
alter table public.groups
  add column blocked_words text[] not null default '{}' check (cardinality(blocked_words) <= 100);

-- Add or remove someone from an event's attendees, atomically (two people
-- RSVPing at once both count). Returns the message's new attachments, or
-- nothing if the message or event is gone.
create function public.set_event_attendance(p_message text, p_index integer, p_member text, p_going boolean)
returns jsonb
language sql
set search_path = ''
as $$
  update public.messages
  set attachments = jsonb_set(
    attachments,
    array[p_index::text, 'attendees'],
    coalesce(
      (
        select jsonb_agg(a)
        from jsonb_array_elements_text(coalesce(attachments -> p_index -> 'attendees', '[]'::jsonb)) as a
        where a <> p_member
      ),
      '[]'::jsonb
    ) || case when p_going then jsonb_build_array(p_member) else '[]'::jsonb end
  )
  where id = p_message
    and deleted_at is null
    and attachments -> p_index ->> 'type' = 'event'
  returning attachments;
$$;

revoke execute on function public.set_event_attendance(text, integer, text, boolean) from public, anon, authenticated;
