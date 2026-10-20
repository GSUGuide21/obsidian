-- Obsidian Chat: find messages by attachment type (a channel's events, polls,
-- quizzes and media) with `attachments @> '[{"type": "poll"}]'`.

create index messages_attachments_idx on public.messages using gin (attachments jsonb_path_ops);
