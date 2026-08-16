-- Bridge between Supabase's `auth` schema and our `public` schema.
--
-- Deliberately NO foreign key from public.profiles.id to auth.users.id.
-- Prisma models foreign keys, cannot see across schemas, and would report one
-- here as drift on every future `migrate dev`. Triggers, functions and RLS
-- policies are invisible to Prisma's differ, so the same integrity is enforced
-- with triggers instead.

-- ---------------------------------------------------------------------------
-- Profile lifecycle
-- ---------------------------------------------------------------------------

-- `security definer` is required to write into public.profiles from a trigger
-- on auth.users. `set search_path = ''` is the hardening that goes with it:
-- without it, a caller-controlled search_path could resolve these unqualified
-- names to attacker-supplied objects. Every name below is fully qualified.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, image, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the email in sync when a user changes it in Supabase Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = new.email, updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_email_change();

-- Stands in for `on delete cascade`. Deleting the profile cascades onward to
-- sites, pages, assets and subscriptions through real Prisma-managed FKs.
create or replace function public.handle_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_user_delete();

-- Backfill any users that already exist (relevant when adding this to a
-- project that already had signups).
insert into public.profiles (id, email, name, created_at, updated_at)
select u.id, u.email, split_part(u.email, '@', 1), now(), now()
  from auth.users u
 where u.email is not null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- RLS is enabled with NO permissive policies, which denies everything reaching
-- these tables through PostgREST with an anon key.
--
-- This is defence-in-depth, NOT the application's access control. Prisma
-- connects with a privileged role and bypasses RLS entirely, so every
-- application query is protected by lib/auth/guards.ts instead. Do not read
-- "RLS is on" as "the data is protected" — add policies here only when a
-- client actually needs direct table access.

alter table public.profiles           enable row level security;
alter table public.sites              enable row level security;
alter table public.pages              enable row level security;
alter table public.symbols            enable row level security;
alter table public.page_versions      enable row level security;
alter table public.assets             enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.processed_webhooks enable row level security;
alter table public.audit_logs         enable row level security;
