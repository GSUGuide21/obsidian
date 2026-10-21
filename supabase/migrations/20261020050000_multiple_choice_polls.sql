-- Obsidian Chat: multiple-choice polls. A poll attachment with "multiple": true
-- lets each member pick any number of its options, so a vote is now one row
-- per chosen option. Single-choice polls still get at most one row per member:
-- the server replaces a member's choice when they pick another (see "poll:vote").

alter table public.poll_votes drop constraint poll_votes_pkey;

alter table public.poll_votes add primary key (message_id, poll_index, member_id, option_index);
