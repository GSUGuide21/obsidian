-- Obsidian Chat: make the instance's only signed-in user an app-wide admin.
--
-- Only when there's exactly one (members of kind 'user'; guests and bots don't
-- count): with none there's nobody to promote, and with several it isn't this
-- migration's place to pick. Either way it does nothing and says so. To make
-- someone an admin by hand:
--   update public.members set role = 'admin' where id = '<auth user id>';
--
-- The chat server reads roles when it starts (and when someone joins), so
-- restart it, or have the user reload, for it to take effect.

do $$
declare
  user_count integer;
  only_user  record;
begin
  select count(*) into user_count from public.members where kind = 'user';

  if user_count <> 1 then
    raise notice 'Not promoting anyone: there are % signed-in users (need exactly 1).', user_count;
    return;
  end if;

  update public.members set role = 'admin'
    where kind = 'user'
    returning id, name into only_user;

  raise notice 'Made % (%) an app-wide admin.', only_user.name, only_user.id;
end
$$;
