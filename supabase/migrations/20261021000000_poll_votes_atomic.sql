-- Obsidian Chat: casting a poll vote in one step. Changing a single-choice
-- vote used to be two requests (add the new choice, then drop the others), so
-- two quick votes could interleave and leave none; a multiple-choice poll's
-- limit (maxChoices) couldn't be checked safely at all. This does it in one
-- transaction, holding a lock on that member's vote in that poll.
--
-- The chat server calls it (see "poll:vote"), having checked that the poll
-- exists, is open and that the option is one of its own. Returns null when the
-- vote is recorded, or 'limit' when the member already has p_max choices.

create function public.cast_poll_vote(
  p_message_id text,
  p_poll_index smallint,
  p_member_id  text,
  -- Null withdraws every choice.
  p_option     smallint,
  -- False takes p_option back (multiple-choice polls); true adds it.
  p_chosen     boolean,
  -- Single-choice: the new choice replaces any other.
  p_single     boolean,
  -- Multiple-choice: at most this many choices; null for any number.
  p_max        smallint
) returns text
language plpgsql
set search_path = ''
as $$
declare
  held integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_message_id || '/' || p_poll_index || '/' || p_member_id));

  if p_option is null then
    delete from public.poll_votes
      where message_id = p_message_id and poll_index = p_poll_index and member_id = p_member_id;
    return null;
  end if;

  if not p_chosen then
    delete from public.poll_votes
      where message_id = p_message_id and poll_index = p_poll_index and member_id = p_member_id
        and option_index = p_option;
    return null;
  end if;

  if p_single then
    delete from public.poll_votes
      where message_id = p_message_id and poll_index = p_poll_index and member_id = p_member_id
        and option_index <> p_option;
  elsif p_max is not null then
    select count(*) into held from public.poll_votes
      where message_id = p_message_id and poll_index = p_poll_index and member_id = p_member_id
        and option_index <> p_option;
    if held >= p_max then
      return 'limit';
    end if;
  end if;

  insert into public.poll_votes (message_id, poll_index, member_id, option_index)
    values (p_message_id, p_poll_index, p_member_id, p_option)
    on conflict do nothing;
  return null;
end;
$$;

-- Only the chat server (the secret key) votes; clients go through it.
revoke execute on function public.cast_poll_vote from public, anon, authenticated;
grant execute on function public.cast_poll_vote to service_role;
