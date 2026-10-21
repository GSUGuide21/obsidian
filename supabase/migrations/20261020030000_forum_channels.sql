-- Obsidian Chat: forum channels. Each top-level message is a post with a
-- title; the conversation about it happens in its thread. Posts are listed by
-- their latest activity (the post, or its thread's newest reply).

alter type public.channel_type add value if not exists 'forum';

-- A forum post's title. Null on every other message. Mirrors MAX_TITLE_LENGTH
-- in lib/chat/types/messages.ts.
alter table public.messages
  add column title text check (char_length(title) between 1 and 100);
