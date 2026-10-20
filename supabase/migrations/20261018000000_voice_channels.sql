-- Obsidian Chat: voice channels. Picking one in the sidebar joins its call
-- (calls themselves live in the chat server's memory); its messages work like
-- a text channel's, for chatting alongside the call.

alter type public.channel_type add value if not exists 'voice';
