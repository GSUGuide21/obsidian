-- Obsidian Chat: read receipts ("Seen by") can be turned off. Off works both
-- ways: others don't see how far you've read, and you don't see theirs.
-- Same access model as before: RLS on, no policies.

alter table public.profiles
  add column read_receipts boolean not null default true;
