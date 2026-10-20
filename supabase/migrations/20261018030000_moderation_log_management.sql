-- Obsidian Chat: the moderation log also records channel and group
-- management (creating, editing, deleting and moving channels; changing the
-- group's settings). Only the allowed actions change.

alter table public.moderation_log drop constraint moderation_log_action_check;

alter table public.moderation_log add constraint moderation_log_action_check check (action in (
  'message_remove', 'event_update', 'message_pin', 'message_unpin',
  'member_mute', 'member_unmute', 'member_kick', 'member_ban', 'member_unban',
  'member_role', 'owner_transfer', 'member_invite', 'invite_revoke',
  'channel_create', 'channel_update', 'channel_delete', 'channel_move', 'group_update'
));
