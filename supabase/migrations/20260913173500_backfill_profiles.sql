insert into public.profiles (id, name, email)
select
  id,
  coalesce(raw_user_meta_data ->> 'name', split_part(email, '@', 1)),
  email
from auth.users
on conflict (id) do nothing;
