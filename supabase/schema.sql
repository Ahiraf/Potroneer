-- Potroneer social schema
-- Run this once in the Supabase SQL editor before setting the VITE_* keys.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Gardener',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Gardener')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.terrariums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Untitled terrarium',
  description text not null default 'A little world made in Potroneer.',
  data jsonb not null default '{}'::jsonb,
  thumbnail text,
  is_public boolean not null default true,
  remix_of uuid references public.terrariums(id) on delete set null,
  challenge_day date,
  likes_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.terrariums enable row level security;

create policy "Public terrariums are readable"
  on public.terrariums for select
  using (is_public = true or (select auth.uid()) = owner_id);

create policy "Users can create their own terrariums"
  on public.terrariums for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update their own terrariums"
  on public.terrariums for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete their own terrariums"
  on public.terrariums for delete to authenticated
  using ((select auth.uid()) = owner_id);

create table if not exists public.terrarium_likes (
  terrarium_id uuid not null references public.terrariums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (terrarium_id, user_id)
);

alter table public.terrarium_likes enable row level security;

create policy "Users can see their own likes"
  on public.terrarium_likes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can like as themselves"
  on public.terrarium_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own likes"
  on public.terrarium_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.update_terrarium_like_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.terrariums set likes_count = likes_count + 1 where id = new.terrarium_id;
    return new;
  end if;
  update public.terrariums set likes_count = greatest(0, likes_count - 1) where id = old.terrarium_id;
  return old;
end;
$$;

drop trigger if exists terrarium_like_count on public.terrarium_likes;
create trigger terrarium_like_count
  after insert or delete on public.terrarium_likes
  for each row execute procedure public.update_terrarium_like_count();

create table if not exists public.terrarium_favorites (
  terrarium_id uuid not null references public.terrariums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (terrarium_id, user_id)
);

alter table public.terrarium_favorites enable row level security;

create policy "Users can see their own favorites"
  on public.terrarium_favorites for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can favorite as themselves"
  on public.terrarium_favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own favorites"
  on public.terrarium_favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.community_submissions (
  day date not null,
  terrarium_id uuid not null references public.terrariums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (day, user_id)
);

alter table public.community_submissions enable row level security;

create policy "Community challenge entries are readable"
  on public.community_submissions for select
  using (true);

create policy "Users can submit as themselves"
  on public.community_submissions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own submission"
  on public.community_submissions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
