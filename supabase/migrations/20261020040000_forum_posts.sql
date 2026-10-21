-- Obsidian Chat: listing forum posts by activity, and tagging them.

-- ---------------------------------------------------------------------------
-- When a top-level message was last active: posted, or its thread's newest
-- reply. Forums list their posts by it (see "forum:posts").
-- ---------------------------------------------------------------------------

alter table public.messages
  add column active_at timestamptz generated always as (greatest(created_at, thread_last_at)) stored;

create index messages_channel_active_idx on public.messages (channel_id, active_at desc, id desc)
  where thread_id is null;

-- ---------------------------------------------------------------------------
-- Tags: each forum defines its own ([{"id", "name"}], in order), and a post
-- carries up to five of their ids. Mirrors MAX_FORUM_TAGS and MAX_POST_TAGS in
-- lib/chat/types/groups.ts. A removed tag's id stays on posts; it just isn't shown.
-- ---------------------------------------------------------------------------

alter table public.channels
  add column forum_tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(forum_tags) = 'array' and jsonb_array_length(forum_tags) <= 20);

alter table public.messages
  add column tags text[] check (cardinality(tags) between 1 and 5);

create index messages_tags_idx on public.messages using gin (tags) where tags is not null;
