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

-- ---------------------------------------------------------------------------
-- Co-op: two people tending one jar
-- ---------------------------------------------------------------------------
-- A room is a short code, an owner, and the latest committed state of the jar.
-- Storing the state (rather than only broadcasting it) is what lets someone who
-- joins late — or who refreshes mid-session — see the garden as it is now
-- instead of an empty jar until the next edit happens to fire.

create table if not exists public.coop_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  build jsonb not null default '{}'::jsonb,
  game jsonb not null default '{}'::jsonb,
  -- Bumped on every accepted write. The clients use it to ignore a snapshot
  -- that arrives after a newer one has already been applied.
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coop_rooms_code_idx on public.coop_rooms (code);

create table if not exists public.coop_room_members (
  room_id uuid not null references public.coop_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.coop_rooms enable row level security;
alter table public.coop_room_members enable row level security;

-- Membership tests have to run as definer. A policy on coop_room_members that
-- queries coop_room_members to decide who may read coop_room_members recurses
-- until Postgres gives up; a definer function sees the table without RLS and
-- breaks the cycle. Both are STABLE and take the room by id or code, so the
-- planner can use the primary key.
create or replace function public.is_coop_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.coop_room_members m
    where m.room_id = p_room_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_coop_member_by_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.coop_room_members m
    join public.coop_rooms r on r.id = m.room_id
    where r.code = upper(p_code) and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_coop_member(uuid) from anon;
revoke execute on function public.is_coop_member_by_code(text) from anon;

-- Rooms: only the people in them can see or change them. Note there is no
-- policy allowing selection by code — that would let anyone enumerate rooms by
-- guessing codes. Joining goes through join_coop_room() below, which checks the
-- code as definer and adds the caller to the room in the same statement.
create policy "Members can read their rooms"
  on public.coop_rooms for select to authenticated
  using (public.is_coop_member(id));

create policy "Users can create rooms they own"
  on public.coop_rooms for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Members can update room state"
  on public.coop_rooms for update to authenticated
  using (public.is_coop_member(id))
  with check (public.is_coop_member(id));

create policy "Owners can delete their rooms"
  on public.coop_rooms for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Members can see who else is in the room"
  on public.coop_room_members for select to authenticated
  using (public.is_coop_member(room_id));

-- Leaving is the only membership write a client makes directly; joining is done
-- by the definer function so the code can be checked first.
create policy "Users can remove their own membership"
  on public.coop_room_members for delete to authenticated
  using ((select auth.uid()) = user_id);

-- --- creating and joining ---------------------------------------------------

-- Six characters from an alphabet with no 0/O/1/I/5/S, because these codes get
-- read aloud and typed on phone keyboards.
create or replace function public.generate_coop_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  candidate text;
  attempt int := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.coop_rooms where code = candidate);
    attempt := attempt + 1;
    if attempt > 40 then
      raise exception 'Could not allocate a free room code';
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.create_coop_room(p_build jsonb default '{}'::jsonb, p_game jsonb default '{}'::jsonb)
returns public.coop_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  room public.coop_rooms;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  insert into public.coop_rooms (code, owner_id, build, game, revision)
  values (public.generate_coop_code(), uid, coalesce(p_build, '{}'::jsonb), coalesce(p_game, '{}'::jsonb), 1)
  returning * into room;
  insert into public.coop_room_members (room_id, user_id)
  values (room.id, uid)
  on conflict do nothing;
  return room;
end;
$$;

-- Joining by code. This is the only path that turns knowing a code into
-- membership, which is why it validates and inserts in one definer call rather
-- than letting the client select the room and then insert itself.
create or replace function public.join_coop_room(p_code text)
returns public.coop_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  room public.coop_rooms;
  member_count int;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into room from public.coop_rooms where code = upper(trim(p_code));
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into member_count from public.coop_room_members where room_id = room.id;
  -- Two gardeners to a jar. Re-joining from another tab is not a third person,
  -- so someone already in the room is always let back in.
  if member_count >= 2 and not exists (
    select 1 from public.coop_room_members where room_id = room.id and user_id = uid
  ) then
    raise exception 'ROOM_FULL' using errcode = 'P0001';
  end if;

  insert into public.coop_room_members (room_id, user_id)
  values (room.id, uid)
  on conflict (room_id, user_id) do nothing;

  return room;
end;
$$;

-- Committing state. Definer so the revision check is atomic: two clients saving
-- at once cannot both read revision 7 and both write revision 8.
create or replace function public.save_coop_state(p_room_id uuid, p_build jsonb, p_game jsonb, p_revision bigint)
returns public.coop_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.coop_rooms;
begin
  if not public.is_coop_member(p_room_id) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;
  update public.coop_rooms
     set build = coalesce(p_build, build),
         game = coalesce(p_game, game),
         revision = greatest(revision + 1, coalesce(p_revision, 0)),
         updated_at = now()
   where id = p_room_id
  returning * into room;
  return room;
end;
$$;

create or replace function public.leave_coop_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  delete from public.coop_room_members where room_id = p_room_id and user_id = uid;
  -- An empty room is litter. The owner's departure takes it with them.
  delete from public.coop_rooms r
   where r.id = p_room_id
     and not exists (select 1 from public.coop_room_members m where m.room_id = r.id);
end;
$$;

revoke execute on function public.create_coop_room(jsonb, jsonb) from anon;
revoke execute on function public.join_coop_room(text) from anon;
revoke execute on function public.save_coop_state(uuid, jsonb, jsonb, bigint) from anon;
revoke execute on function public.leave_coop_room(uuid) from anon;

-- --- realtime authorization -------------------------------------------------
-- Private channels are authorized by RLS on realtime.messages. Without these
-- policies a private channel simply refuses every subscription; with them, the
-- topic name ("coop:ABC123") is checked against room membership, so knowing a
-- room code is not enough to listen in — you have to have been let in.
--
-- Both broadcast and presence travel through this table, so SELECT covers
-- receiving snapshots and seeing who is present, and INSERT covers sending
-- them and announcing yourself.

drop policy if exists "Co-op members can read room messages" on realtime.messages;
create policy "Co-op members can read room messages"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'coop:%'
    and public.is_coop_member_by_code(split_part(realtime.topic(), ':', 2))
  );

drop policy if exists "Co-op members can write room messages" on realtime.messages;
create policy "Co-op members can write room messages"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'coop:%'
    and public.is_coop_member_by_code(split_part(realtime.topic(), ':', 2))
  );
