-- Admin platform: the app owner sells access to "tenants" (shops, schools, clinics...).
-- Each tenant gets an activation key, a plan, an expiry date, and users with roles.
-- Payments are recorded by hand (mobile money, cash...) and push the expiry date.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Run supabase/schema.sql first. In this app a subscription ("Pro account") gives its
-- members unlimited videos instead of spending credits (see the end of this file).

create extension if not exists pgcrypto with schema extensions;

-- ---------- platform owner & settings ----------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  brand text not null default 'Stone''s AI Video',
  support_phone text not null default '',
  support_whatsapp text not null default '',
  support_email text not null default '',
  currency text not null default 'FCFA',
  trial_days int not null default 14,
  tiers jsonb not null default
    '{"basic":{"users":1,"monthly":2500,"yearly":25000},"pro":{"users":3,"monthly":5000,"yearly":50000},"business":{"users":10,"monthly":12000,"yearly":120000}}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict do nothing;
-- Weekly pass price (shown in the app, used by the "+1 week" button).
alter table public.platform_settings add column if not exists weekly_price numeric not null default 1000;
-- Move the first draft prices to the November 2026 prices, unless you already changed them.
update public.platform_settings set tiers = '{"basic":{"users":1,"monthly":2500,"yearly":25000},"pro":{"users":3,"monthly":5000,"yearly":50000},"business":{"users":10,"monthly":12000,"yearly":120000}}'::jsonb
 where id = 1 and tiers = '{"basic":{"users":1,"monthly":3000,"yearly":30000},"pro":{"users":3,"monthly":7000,"yearly":70000},"business":{"users":10,"monthly":15000,"yearly":150000}}'::jsonb;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- The first account to call this becomes the platform owner. Afterwards it does nothing.
create or replace function public.claim_platform_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.platform_admins) then
    return exists (select 1 from public.platform_admins where user_id = auth.uid());
  end if;
  insert into public.platform_admins (user_id) values (auth.uid());
  return true;
end $$;

-- e.g. SAV-7KQ2-M9XD-4TPA (no 0/O/1/I to avoid reading mistakes)
create or replace function public.gen_license_key()
returns text language sql volatile set search_path = public, extensions as $$
  select 'SAV-' || string_agg(chunk, '-')
  from (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(extensions.gen_random_bytes(1),0) % 32) + 1, 1), '') as chunk
    from generate_series(1,12) g group by (g - 1) / 4 order by (g - 1) / 4
  ) s;
$$;

-- ---------- tenants, payments, members ----------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  country text not null default '',
  currency text not null default 'FCFA',
  plan text not null default 'trial' check (plan in ('trial','monthly','yearly','custom')),
  tier text not null default 'pro' check (tier in ('basic','pro','business')),
  status text not null default 'active' check (status in ('active','suspended')),
  license_key text not null unique default public.gen_license_key(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  activated_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  amount numeric not null default 0,
  method text not null default '',
  period text not null default '',
  new_expires_at timestamptz,
  note text not null default '',
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- ROLES: edit this list here, in admin_add_user / admin_update_member, and in ADMIN_CONFIG.roles.
create table if not exists public.members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff')),
  display_name text not null default '',
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- ---------- helpers the app itself uses ----------
create or replace function public.my_role(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.members where tenant_id = p_tenant and user_id = auth.uid() and active;
$$;

-- Use this in the RLS of the app's own tables: writes allowed only while the tenant is paid up.
create or replace function public.tenant_is_open(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenants where id = p_tenant and status = 'active' and expires_at > now());
$$;

-- An owner signs up, then enters the key to claim the tenant. A key creates one owner only.
create or replace function public.activate_tenant(p_key text, p_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.tenants; uemail text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into s from public.tenants where upper(license_key) = upper(trim(p_key));
  if not found then raise exception 'This activation key does not exist. Check it and try again.'; end if;
  if s.status <> 'active' then raise exception 'This account is suspended. Contact your provider.'; end if;
  if exists (select 1 from public.members where tenant_id = s.id and user_id = auth.uid()) then return s.id; end if;
  if exists (select 1 from public.members where tenant_id = s.id and role = 'owner') then
    raise exception 'This key has already been used. Ask the owner to add you.';
  end if;
  select email into uemail from auth.users where id = auth.uid();
  insert into public.members (tenant_id, user_id, role, display_name, email)
    values (s.id, auth.uid(), 'owner', coalesce(nullif(p_name,''), s.owner_name), coalesce(uemail,''));
  update public.tenants set activated_at = coalesce(activated_at, now()) where id = s.id;
  return s.id;
end $$;

-- ---------- admin actions ----------
create or replace function public.admin_extend(p_tenant uuid, p_until timestamptz, p_amount numeric, p_method text, p_period text, p_note text, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  update public.tenants set expires_at = p_until, plan = coalesce(nullif(p_plan,''), plan), status = 'active' where id = p_tenant;
  insert into public.payments (tenant_id, amount, method, period, new_expires_at, note)
    values (p_tenant, coalesce(p_amount,0), coalesce(p_method,''), coalesce(p_period,''), p_until, coalesce(p_note,''));
end $$;

create or replace function public.admin_regenerate_key(p_tenant uuid)
returns text language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  update public.tenants set license_key = public.gen_license_key() where id = p_tenant returning license_key into k;
  return k;
end $$;

-- Activity per tenant without reading its data: active users and their latest sign-in.
create or replace function public.admin_tenant_stats()
returns table (tenant_id uuid, members int, last_activity timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select t.id,
    (select count(*)::int from public.members m where m.tenant_id = t.id and m.active),
    (select max(u.last_sign_in_at) from public.members m join auth.users u on u.id = m.user_id where m.tenant_id = t.id)
  from public.tenants t
  where public.is_platform_admin();
$$;

create or replace function public.admin_tenant_users(p_tenant uuid)
returns table (user_id uuid, email text, display_name text, role text, active boolean, confirmed boolean, last_sign_in timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return query
    select m.user_id, coalesce(u.email, m.email)::text, m.display_name, m.role, m.active,
           (u.email_confirmed_at is not null), u.last_sign_in_at
    from public.members m left join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant
    order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, m.display_name;
end $$;

-- New password; the email is marked confirmed so the person can sign in at once.
create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'The password must have at least 6 characters.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
   where id = p_user;
  if not found then raise exception 'This account does not exist.'; end if;
end $$;

create or replace function public.admin_set_email(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(trim(coalesce(p_email,'')));
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'This email is not valid.'; end if;
  if exists (select 1 from auth.users where lower(email) = e and id <> p_user) then raise exception 'Another account already uses this email.'; end if;
  update auth.users set email = e, email_confirmed_at = coalesce(email_confirmed_at, now()),
         email_change = '', email_change_token_new = '', updated_at = now() where id = p_user;
  if not found then raise exception 'This account does not exist.'; end if;
  update auth.identities set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', e), updated_at = now()
   where user_id = p_user and provider = 'email';
  update public.members set email = e where user_id = p_user;
end $$;

-- Create a ready-to-use login (no confirmation email) and put it in a tenant.
-- If the email already has an account, that account joins the tenant and gets the new password.
create or replace function public.admin_add_user(p_tenant uuid, p_email text, p_password text, p_role text, p_name text default '')
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare e text := lower(trim(coalesce(p_email,''))); uid uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_role not in ('owner','manager','staff') then raise exception 'Unknown role.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'This email is not valid.'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'The password must have at least 6 characters.'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'This account does not exist.'; end if;
  if p_role = 'owner' and exists (select 1 from public.members where tenant_id = p_tenant and role = 'owner') then
    raise exception 'There is already an owner. Change the owner''s email and password instead.';
  end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
            extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true),
            'email', now(), now(), now());
  else
    update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
  end if;
  insert into public.members (tenant_id, user_id, role, display_name, email)
    values (p_tenant, uid, p_role, coalesce(nullif(trim(p_name),''), split_part(e,'@',1)), e)
    on conflict (tenant_id, user_id) do update set role = excluded.role, active = true,
       display_name = case when trim(coalesce(p_name,'')) = '' then public.members.display_name else excluded.display_name end;
  if p_role = 'owner' then update public.tenants set activated_at = coalesce(activated_at, now()) where id = p_tenant; end if;
  return uid;
end $$;

create or replace function public.admin_update_member(p_tenant uuid, p_user uuid, p_role text, p_name text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_role not in ('owner','manager','staff') then raise exception 'Unknown role.'; end if;
  if p_role = 'owner' and exists (select 1 from public.members where tenant_id = p_tenant and role = 'owner' and user_id <> p_user) then
    raise exception 'There is already an owner.';
  end if;
  update public.members set role = p_role, display_name = coalesce(nullif(trim(p_name),''), display_name), active = p_active
   where tenant_id = p_tenant and user_id = p_user;
  if not found then raise exception 'This person is not in this account.'; end if;
end $$;

-- Prices for a public sales page (no login needed).
create or replace function public.public_pricing()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('brand', brand, 'currency', currency, 'trial_days', trial_days, 'tiers', tiers, 'weekly_price', weekly_price,
    'support_phone', support_phone, 'support_whatsapp', support_whatsapp, 'support_email', support_email)
  from public.platform_settings where id = 1;
$$;

-- ---------- row level security ----------
alter table public.platform_admins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.tenants enable row level security;
alter table public.payments enable row level security;
alter table public.members enable row level security;

drop policy if exists "admins see themselves" on public.platform_admins;
drop policy if exists "signed in reads settings" on public.platform_settings;
drop policy if exists "admin edits settings" on public.platform_settings;
drop policy if exists "admin manages tenants" on public.tenants;
drop policy if exists "members read their tenant" on public.tenants;
drop policy if exists "admin manages payments" on public.payments;
drop policy if exists "owner reads payments" on public.payments;
drop policy if exists "admin reads members" on public.members;
drop policy if exists "members see colleagues" on public.members;

create policy "admins see themselves" on public.platform_admins for select using (user_id = auth.uid());
create policy "signed in reads settings" on public.platform_settings for select to authenticated using (true);
create policy "admin edits settings" on public.platform_settings for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admin manages tenants" on public.tenants for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "members read their tenant" on public.tenants for select to authenticated using (public.my_role(id) is not null);
create policy "admin manages payments" on public.payments for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "owner reads payments" on public.payments for select to authenticated using (public.my_role(tenant_id) = 'owner');
create policy "admin reads members" on public.members for select to authenticated using (public.is_platform_admin());
create policy "members see colleagues" on public.members for select to authenticated using (user_id = auth.uid() or public.my_role(tenant_id) is not null);

-- ---------- lock down functions ----------
do $$ declare f text; begin
  foreach f in array array[
    'claim_platform_admin()', 'activate_tenant(text,text)',
    'admin_extend(uuid,timestamptz,numeric,text,text,text,text)', 'admin_regenerate_key(uuid)', 'admin_tenant_stats()',
    'admin_tenant_users(uuid)', 'admin_set_password(uuid,text)', 'admin_set_email(uuid,text)',
    'admin_add_user(uuid,text,text,text,text)', 'admin_update_member(uuid,uuid,text,text,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.public_pricing() to anon, authenticated;

-- ---------- table access ----------
-- This project does not grant table access by default. RLS above still decides what each person sees.
grant select on public.platform_admins to authenticated;
grant select, update on public.platform_settings to authenticated;
grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select on public.members to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.my_role(uuid) to authenticated;
grant execute on function public.tenant_is_open(uuid) to authenticated;

-- ---------- AI Video app: a paid subscription means unlimited videos ----------
-- The signed-in user's subscription (the best one if they belong to several).
create or replace function public.my_subscription()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tenant_id', t.id, 'name', t.name, 'tier', t.tier, 'plan', t.plan,
         'expires_at', t.expires_at, 'role', m.role, 'open', (t.status = 'active' and t.expires_at > now()))
  from public.members m join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid() and m.active
  order by (t.status = 'active' and t.expires_at > now()) desc, t.expires_at desc
  limit 1;
$$;
revoke all on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;

-- spend_credits() in schema.sql already skips credits for members of an open subscription.

-- ---------- credit packs ----------
-- The owner adds credits a customer bought (mobile money, cash...). Returns the new balance.
create or replace function public.admin_add_credits(p_email text, p_credits integer, p_paid numeric default 0, p_note text default '')
returns integer language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; bal integer;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if coalesce(p_credits, 0) = 0 or abs(p_credits) > 100000 then raise exception 'Enter a number of credits.'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if uid is null then raise exception 'No app account uses this email. Ask the customer to sign up first.'; end if;
  insert into public.profiles (id, display_name) values (uid, split_part(p_email, '@', 1)) on conflict (id) do nothing;
  update public.profiles set credits = greatest(0, credits + p_credits) where id = uid returning credits into bal;
  insert into public.credit_transactions (user_id, amount, reason)
  values (uid, p_credits, left(trim(both ' ·' from concat_ws(' · ', 'Bought', nullif(coalesce(p_paid, 0), 0)::text || ' paid', nullif(trim(coalesce(p_note, '')), ''))), 120));
  return bal;
end $$;
revoke all on function public.admin_add_credits(text, integer, numeric, text) from public, anon;
grant execute on function public.admin_add_credits(text, integer, numeric, text) to authenticated;

-- Recent credit sales for the admin page.
create or replace function public.admin_credit_sales(p_limit integer default 50)
returns table (email text, amount integer, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return query
    select u.email::text, c.amount, c.reason, c.created_at
    from public.credit_transactions c join auth.users u on u.id = c.user_id
    where c.reason like 'Bought%'
    order by c.created_at desc limit greatest(1, least(p_limit, 500));
end $$;
revoke all on function public.admin_credit_sales(integer) from public, anon;
grant execute on function public.admin_credit_sales(integer) to authenticated;
