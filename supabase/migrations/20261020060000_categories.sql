-- Obsidian Chat: channel categories as things of their own. A group keeps the
-- order of its sidebar sections, empty ones included, so categories can be
-- made before any channel is in them and moved as a block. A channel's
-- `category` still says which one it's in; a name used by channels but not
-- listed here sorts after the listed ones (see categoryOrder in lib/chat/order.ts).
-- Mirrors MAX_CATEGORIES and MAX_CATEGORY_LENGTH in lib/chat/types/groups.ts.

alter table public.groups
  add column categories text[] not null default '{}'
    check (cardinality(categories) <= 50);

-- ---------------------------------------------------------------------------
-- The moderation log also records categories being made, renamed and deleted.
-- ---------------------------------------------------------------------------

alter table public.moderation_log drop constraint moderation_log_action_check;

alter table public.moderation_log add constraint moderation_log_action_check check (action in (
  'message_remove', 'event_update', 'message_pin', 'message_unpin',
  'member_mute', 'member_unmute', 'member_kick', 'member_ban', 'member_unban',
  'member_role', 'owner_transfer', 'member_invite', 'invite_revoke',
  'channel_create', 'channel_update', 'channel_delete', 'channel_move', 'group_update',
  'invite_link_create', 'invite_link_revoke', 'report_dismiss',
  'webhook_create', 'webhook_delete', 'emoji_add', 'emoji_remove',
  'bot_add', 'bot_remove',
  'role_create', 'role_update', 'role_delete', 'member_roles',
  'sticker_add', 'sticker_remove',
  'category_create', 'category_rename', 'category_delete'
));
