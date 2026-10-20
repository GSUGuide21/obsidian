-- Obsidian Chat: system messages, posted by the server when something happens
-- in a channel or group (someone joined or left, a message was pinned, a
-- channel was created, renamed or given a new topic). `author_id` is who did
-- it; `system` says what happened (see SystemEvent in lib/chat/types.ts).
-- They have no body or attachments and never count as unread.

alter table public.messages
  add column system jsonb check (system is null or jsonb_typeof(system) = 'object');
