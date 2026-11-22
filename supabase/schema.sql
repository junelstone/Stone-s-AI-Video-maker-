-- Stone's AI Video: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run more than once.

-- 1. Profiles with credits ------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  credits integer not null default 30 check (credits >= 0),
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
-- No update policy on purpose: credits only change through spend_credits()
-- or from the server (service role) when a payment is confirmed.

-- Give every new user a profile with their free credits.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  insert into public.credit_transactions (user_id, amount, reason)
  values (new.id, 30, 'Welcome bonus');
  return new;
end;
$$;

-- 2. Credit history -------------------------------------------------------
create table if not exists public.credit_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists credit_transactions_user_idx on public.credit_transactions (user_id);

alter table public.credit_transactions enable row level security;
drop policy if exists "credits: read own" on public.credit_transactions;
create policy "credits: read own" on public.credit_transactions
  for select to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Spend credits safely (cannot go below zero, cannot be called for someone else).
create or replace function public.spend_credits(amount integer, reason text default 'video')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_balance integer;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if amount < 1 or amount > 20 then
    raise exception 'Invalid amount';
  end if;
  update public.profiles
     set credits = credits - amount
   where id = uid and credits >= amount
  returning credits into new_balance;
  if new_balance is null then
    raise exception 'Not enough credits';
  end if;
  insert into public.credit_transactions (user_id, amount, reason)
  values (uid, -amount, left(coalesce(reason, 'video'), 80));
  return new_balance;
end;
$$;

revoke all on function public.spend_credits(integer, text) from public, anon;
grant execute on function public.spend_credits(integer, text) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Profiles for users who signed up before this script ran.
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- 3. Saved videos ---------------------------------------------------------
create table if not exists public.videos (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null default 'My video',
  prompt text,
  mode text not null check (mode in ('text', 'image', 'avatar')),
  style text,
  aspect text,
  duration real,
  mime text,
  engine text default 'demo',
  storage_path text not null,
  thumb_path text,
  created_at timestamptz not null default now()
);
create index if not exists videos_user_created_idx on public.videos (user_id, created_at desc);

alter table public.videos enable row level security;
drop policy if exists "videos: read own" on public.videos;
create policy "videos: read own" on public.videos
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "videos: insert own" on public.videos;
create policy "videos: insert own" on public.videos
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "videos: delete own" on public.videos;
create policy "videos: delete own" on public.videos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 4. Private storage bucket for video files -------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 104857600, array['video/webm', 'video/mp4', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "videos bucket: read own" on storage.objects;
create policy "videos bucket: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "videos bucket: upload own" on storage.objects;
create policy "videos bucket: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "videos bucket: update own" on storage.objects;
create policy "videos bucket: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "videos bucket: delete own" on storage.objects;
create policy "videos bucket: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 5. Table permissions for signed-in users --------------------------------
-- Some new Supabase projects don't grant table access by default.
-- Row level security above still limits each user to their own rows.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select on public.credit_transactions to authenticated;
grant select, insert, delete on public.videos to authenticated;
